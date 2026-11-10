import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Observable,
  TimeoutError,
  catchError,
  finalize,
  map,
  shareReplay,
  throwError,
  timeout,
} from 'rxjs';
import { environment } from '../../environments/environment';
import {
  OpenTdbResponseCode,
  OpenTriviaQuestion,
  OpenTriviaResponse,
  QuizAnswer,
  QuizDomainError,
  QuizQuestion,
  QuizSettings,
} from '../models/quiz.models';

const NAMED_HTML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  iquest: '¿',
  iexcl: '¡',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  deg: '°',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  pi: 'π',
  shy: '',
};

@Injectable({
  providedIn: 'root',
})
export class OpenTdbService {
  private readonly baseUrl = environment.openTdbApiUrl || 'https://opentdb.com/api.php';
  private readonly requestTimeoutMs = 10000;
  private inFlightRequest$: Observable<QuizQuestion[]> | null = null;

  constructor(private readonly http: HttpClient) {}

  /**
   * Consulta preguntas reales desde Open Trivia Database (OpenTDB) aplicando los filtros de configuración.
   *
   * @param settings Configuración elegida por el usuario: cantidad de preguntas (1 a 50),
   *                 categoría temática, nivel de dificultad y tipo de pregunta.
   * @returns Un Observable que emite la lista de preguntas transformadas, sanitizadas y mezcladas.
   * @throws {QuizDomainError} Con código `'INVALID_PARAMS'` si la cantidad solicitada no es válida,
   *                           o con el código respectivo devuelto por OpenTDB (p. ej. `'NO_RESULTS'`, `'RATE_LIMIT'`).
   * @remarks
   * Implementa deduplicación de peticiones concurrentes mediante `shareReplay(1)` para evitar llamadas
   * duplicadas al servidor mientras una solicitud idéntica se encuentre en curso.
   */
  getQuestions(settings: QuizSettings): Observable<QuizQuestion[]> {
    if (
      !Number.isInteger(settings.amount) ||
      settings.amount < 1 ||
      settings.amount > 50
    ) {
      return throwError(
        () =>
          new QuizDomainError(
            'INVALID_PARAMS',
            'La cantidad de preguntas debe ser un número entero entre 1 y 50.',
            true
          )
      );
    }

    if (this.inFlightRequest$) {
      return this.inFlightRequest$;
    }

    let params = new HttpParams()
      .set('amount', String(settings.amount))
      .set('encode', 'url3986');

    if (typeof settings.category === 'number' && settings.category > 0) {
      params = params.set('category', String(settings.category));
    }
    if (settings.difficulty) {
      params = params.set('difficulty', settings.difficulty);
    }
    if (settings.type) {
      params = params.set('type', settings.type);
    }

    const request$ = this.http
      .get<OpenTriviaResponse>(this.baseUrl, { params })
      .pipe(
        timeout(this.requestTimeoutMs),
        map((response) => this.validateAndTransformResponse(response)),
        catchError((err: unknown) => throwError(() => this.toDomainError(err))),
        finalize(() => {
          this.inFlightRequest$ = null;
        }),
        shareReplay(1)
      );

    this.inFlightRequest$ = request$;
    return request$;
  }

  /**
   * Valida el código de estado de OpenTDB y mapea los resultados crudos a modelos del dominio.
   *
   * @param response Payload recibido desde la API de OpenTDB.
   * @returns Lista de preguntas formateadas y listas para la partida.
   * @throws {QuizDomainError} Si la respuesta es nula, posee formato inválido o indica un código de error de OpenTDB.
   */
  private validateAndTransformResponse(
    response: OpenTriviaResponse | null | undefined
  ): QuizQuestion[] {
    if (!response || typeof response.response_code !== 'number') {
      throw new QuizDomainError(
        'INVALID_RESPONSE',
        'La respuesta del servidor de trivia no tiene un formato válido.',
        true
      );
    }

    switch (response.response_code) {
      case OpenTdbResponseCode.Success:
        break;
      case OpenTdbResponseCode.NoResults:
        throw new QuizDomainError(
          'NO_RESULTS',
          'No se encontraron preguntas para los filtros elegidos. Probá reducir la cantidad o elegir otra categoría o dificultad.',
          true
        );
      case OpenTdbResponseCode.InvalidParameter:
        throw new QuizDomainError(
          'INVALID_PARAMS',
          'Los filtros seleccionados no son válidos. Revisá la configuración e intentá de nuevo.',
          true
        );
      case OpenTdbResponseCode.TokenNotFound:
        throw new QuizDomainError(
          'TOKEN_NOT_FOUND',
          'La sesión de preguntas caducó. Intentá iniciar una nueva partida.',
          true
        );
      case OpenTdbResponseCode.TokenEmpty:
        throw new QuizDomainError(
          'TOKEN_EMPTY',
          'Ya respondiste todas las preguntas disponibles para esta combinación de filtros.',
          true
        );
      case OpenTdbResponseCode.RateLimit:
        throw new QuizDomainError(
          'RATE_LIMIT',
          'Demasiadas consultas seguidas a OpenTDB. Esperá unos segundos y volvé a intentar.',
          true
        );
      default:
        throw new QuizDomainError(
          'INVALID_RESPONSE',
          'OpenTDB devolvió un estado inesperado. Intentá nuevamente.',
          true
        );
    }

    if (!Array.isArray(response.results) || response.results.length === 0) {
      throw new QuizDomainError(
        'NO_RESULTS',
        'No se encontraron preguntas para los filtros elegidos. Probá cambiar la categoría o dificultad.',
        true
      );
    }

    return response.results.map((item, index) =>
      this.transformQuestion(item, index)
    );
  }

  /**
   * Transforma una pregunta cruda de OpenTDB en una entidad de dominio `QuizQuestion`.
   *
   * Realiza la sanitización de textos, la asignación de identificadores únicos determinísticos,
   * la identificación de la respuesta correcta (`correctAnswerId`) y el mezclado aleatorio de las opciones.
   *
   * @param raw Objeto de pregunta recibido desde la API externa.
   * @param questionIndex Posición ordinal de la pregunta dentro del lote actual.
   * @returns Instancia de `QuizQuestion` lista para ser consumida por el motor de juego.
   * @throws {QuizDomainError} Si la pregunta carece de enunciado o de opciones válidas.
   */
  private transformQuestion(
    raw: OpenTriviaQuestion,
    questionIndex: number
  ): QuizQuestion {
    const questionId = `q_${questionIndex + 1}_${this.shortHash(raw.question)}_${Date.now()}`;
    const decodedQuestion = this.sanitizeAndDecode(raw.question);
    const decodedCategory = this.sanitizeAndDecode(raw.category);
    const decodedDifficulty = this.sanitizeAndDecode(raw.difficulty);
    const decodedCorrect = this.sanitizeAndDecode(raw.correct_answer);
    const decodedIncorrect = (raw.incorrect_answers ?? []).map((ans) =>
      this.sanitizeAndDecode(ans)
    );

    if (!decodedQuestion || !decodedCorrect || decodedIncorrect.length === 0) {
      throw new QuizDomainError(
        'INVALID_RESPONSE',
        'Se recibió una pregunta incompleta desde el proveedor de trivia.',
        true
      );
    }

    const correctAnswerId = `${questionId}_ans_correct`;
    const unshuffledAnswers: QuizAnswer[] = [
      {
        id: correctAnswerId,
        text: decodedCorrect,
        isCorrect: true,
      },
      ...decodedIncorrect.map((text, idx) => ({
        id: `${questionId}_ans_inc_${idx + 1}`,
        text,
        isCorrect: false,
      })),
    ];

    const shuffledAnswers = this.shuffleArray(unshuffledAnswers);

    return {
      id: questionId,
      category: decodedCategory,
      difficulty: decodedDifficulty,
      type: raw.type === 'boolean' ? 'boolean' : 'multiple',
      question: decodedQuestion,
      answers: shuffledAnswers,
      correctAnswerId,
    };
  }

  /**
   * Sanitiza y decodifica cadenas provenientes de fuentes externas.
   *
   * Aplica un proceso de limpieza en múltiples etapas:
   * 1. Decodificación de URL encoding (RFC 3986).
   * 2. Reemplazo de entidades HTML numéricas y nombradas.
   * 3. Remoción de bloques `<script>`, `<style>` y etiquetas HTML para prevenir ataques XSS.
   * 4. Normalización de espacios en blanco consecutivos.
   *
   * @param raw Texto crudo potencialmente codificado o con marcado.
   * @returns Texto plano limpio y seguro para su renderizado.
   */
  sanitizeAndDecode(raw: string): string {
    if (!raw) {
      return '';
    }

    let text = raw;
    try {
      text = decodeURIComponent(text);
    } catch {
      // Si no estaba URL-encoded o tiene un % literal aislado, conservamos el texto
    }

    text = this.decodeHtmlEntities(text);

    // Eliminar bloques script/style completos y cualquier etiqueta HTML remanente
    text = text.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    text = text.replace(/<[^>]+>/g, '');

    // Segunda pasada por si había entidades doblemente codificadas pero sin permitir tags
    text = this.decodeHtmlEntities(text).replace(/<[^>]+>/g, '');

    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Reemplaza entidades HTML numéricas (decimales y hexadecimales) y entidades nombradas comunes.
   *
   * @param input Texto que contiene posibles entidades HTML.
   * @returns Texto con las entidades convertidas a caracteres UTF-8.
   */
  private decodeHtmlEntities(input: string): string {
    return input
      .replace(/&#(\d+);/g, (_match, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
      })
      .replace(/&([a-zA-Z0-9]+);/g, (match, entity: string) => {
        return entity in NAMED_HTML_ENTITIES ? NAMED_HTML_ENTITIES[entity] : match;
      });
  }

  /**
   * Aplica el algoritmo Fisher-Yates (Knuth) para desordenar un arreglo de forma determinística e inmutable.
   *
   * @template T Tipo de los elementos del arreglo.
   * @param items Arreglo original de elementos.
   * @returns Nuevo arreglo con los elementos permutados aleatoriamente, sin modificar la fuente original.
   */
  private shuffleArray<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  /**
   * Normaliza excepciones de red, timeouts de RxJS y errores HTTP en instancias tipadas de `QuizDomainError`.
   *
   * @param error Error capturado durante la ejecución de la petición.
   * @returns Error de dominio con mensaje explicativo amigable para el usuario.
   */
  private toDomainError(error: unknown): QuizDomainError {
    if (error instanceof QuizDomainError) {
      return error;
    }
    if (error instanceof TimeoutError) {
      return new QuizDomainError(
        'TIMEOUT',
        'La consulta de preguntas tardó demasiado tiempo. Verificá tu conexión e intentá nuevamente.',
        true
      );
    }
    return new QuizDomainError(
      'NETWORK_ERROR',
      'No se pudo conectar con el servidor de preguntas. Revisá tu conexión a Internet y reintentá.',
      true
    );
  }

  private shortHash(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }
}
