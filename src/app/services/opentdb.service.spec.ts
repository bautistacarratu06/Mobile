import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { OpenTdbService } from './opentdb.service';
import {
  OpenTdbResponseCode,
  OpenTriviaResponse,
  QuizDomainError,
  QuizQuestion,
} from '../models/quiz.models';

describe('OpenTdbService (IFT-2)', () => {
  let service: OpenTdbService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [OpenTdbService],
    });
    service = TestBed.inject(OpenTdbService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('builds URL with amount and encode=url3986, omitting optional filters when not set', () => {
    let result: QuizQuestion[] | undefined;

    service.getQuestions({ amount: 5 }).subscribe((questions) => {
      result = questions;
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'https://opentdb.com/api.php' &&
        r.params.get('amount') === '5' &&
        r.params.get('encode') === 'url3986' &&
        !r.params.has('category') &&
        !r.params.has('difficulty') &&
        !r.params.has('type')
    );
    expect(req.request.method).toBe('GET');

    const mockResponse: OpenTriviaResponse = {
      response_code: OpenTdbResponseCode.Success,
      results: [
        {
          category: 'Science%20%26%20Nature',
          type: 'multiple',
          difficulty: 'easy',
          question: 'What%20is%20H2O%3F',
          correct_answer: 'Water',
          incorrect_answers: ['Oxygen', 'Hydrogen', 'Helium'],
        },
      ],
    };

    req.flush(mockResponse);

    expect(result).toBeDefined();
    expect(result?.length).toBe(1);
    expect(result?.[0].category).toBe('Science & Nature');
    expect(result?.[0].question).toBe('What is H2O?');
  });

  it('includes category, difficulty, and type params only when explicitly provided', () => {
    service
      .getQuestions({
        amount: 10,
        category: 18,
        difficulty: 'medium',
        type: 'boolean',
      })
      .subscribe();

    const req = httpMock.expectOne(
      (r) =>
        r.url === 'https://opentdb.com/api.php' &&
        r.params.get('amount') === '10' &&
        r.params.get('category') === '18' &&
        r.params.get('difficulty') === 'medium' &&
        r.params.get('type') === 'boolean'
    );

    req.flush({
      response_code: OpenTdbResponseCode.Success,
      results: [
        {
          category: 'Science%3A%20Computers',
          type: 'boolean',
          difficulty: 'medium',
          question: 'Linus%20Torvalds%20created%20Linux.',
          correct_answer: 'True',
          incorrect_answers: ['False'],
        },
      ],
    });
  });

  it('decodes HTML entities and URL encoding and strips executable HTML tags', () => {
    let question!: QuizQuestion;

    service.getQuestions({ amount: 1 }).subscribe((res) => {
      question = res[0];
    });

    const req = httpMock.expectOne((r) => r.url === 'https://opentdb.com/api.php');
    req.flush({
      response_code: OpenTdbResponseCode.Success,
      results: [
        {
          category: 'Entertainment%3A%20Books',
          type: 'multiple',
          difficulty: 'hard',
          question:
            '&iquest;Qui&eacute;n escribi&oacute; &quot;Cien a&#039;os&quot;? <script>alert(1)</script><b>Autor</b>',
          correct_answer: 'Gabriel Garc&iacute;a M&aacute;rquez <img src=x onerror=alert(1)>',
          incorrect_answers: ['Julio Cort&aacute;zar &amp; Borges'],
        },
      ],
    });

    expect(question.question).toBe('¿Quién escribió "Cien a\'os"? Autor');
    expect(question.question).not.toContain('<script>');
    const correct = question.answers.find((a) => a.id === question.correctAnswerId);
    expect(correct).toBeDefined();
    expect(correct?.text).toBe('Gabriel García Márquez');
    const incorrect = question.answers.find((a) => !a.isCorrect);
    expect(incorrect?.text).toBe('Julio Cortázar & Borges');
  });

  it('shuffles answers using Fisher-Yates and keeps correctAnswerId bound to the single correct option', () => {
    let question!: QuizQuestion;

    service.getQuestions({ amount: 1 }).subscribe((res) => {
      question = res[0];
    });

    const req = httpMock.expectOne((r) => r.url === 'https://opentdb.com/api.php');
    req.flush({
      response_code: OpenTdbResponseCode.Success,
      results: [
        {
          category: 'Geography',
          type: 'multiple',
          difficulty: 'easy',
          question: 'Capital of Argentina?',
          correct_answer: 'Buenos Aires',
          incorrect_answers: ['Santiago', 'Montevideo', 'Lima'],
        },
      ],
    });

    expect(question.answers.length).toBe(4);
    const correctAnswers = question.answers.filter((a) => a.isCorrect);
    expect(correctAnswers.length).toBe(1);
    expect(correctAnswers[0].text).toBe('Buenos Aires');
    expect(question.correctAnswerId).toBe(correctAnswers[0].id);
  });

  it('maps OpenTDB response_code 1, 2, 3, 4, 5 to clear domain errors', () => {
    const cases: Array<{ code: number; expectedErrorCode: string }> = [
      { code: OpenTdbResponseCode.NoResults, expectedErrorCode: 'NO_RESULTS' },
      { code: OpenTdbResponseCode.InvalidParameter, expectedErrorCode: 'INVALID_PARAMS' },
      { code: OpenTdbResponseCode.TokenNotFound, expectedErrorCode: 'TOKEN_NOT_FOUND' },
      { code: OpenTdbResponseCode.TokenEmpty, expectedErrorCode: 'TOKEN_EMPTY' },
      { code: OpenTdbResponseCode.RateLimit, expectedErrorCode: 'RATE_LIMIT' },
    ];

    for (const testCase of cases) {
      let capturedError: unknown;
      service.getQuestions({ amount: 5 }).subscribe({
        error: (err) => {
          capturedError = err;
        },
      });

      const req = httpMock.expectOne((r) => r.url === 'https://opentdb.com/api.php');
      req.flush({
        response_code: testCase.code,
        results: [],
      });

      expect(capturedError).toBeInstanceOf(QuizDomainError);
      expect((capturedError as QuizDomainError).code).toBe(testCase.expectedErrorCode);
    }
  });

  it('maps HTTP network failures into a recoverable NETWORK_ERROR domain error', () => {
    let capturedError: unknown;
    service.getQuestions({ amount: 5 }).subscribe({
      error: (err) => {
        capturedError = err;
      },
    });

    const req = httpMock.expectOne((r) => r.url === 'https://opentdb.com/api.php');
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(capturedError).toBeInstanceOf(QuizDomainError);
    expect((capturedError as QuizDomainError).code).toBe('NETWORK_ERROR');
  });

  it('prevents duplicate HTTP requests when called concurrently before the first completes', () => {
    const results: QuizQuestion[][] = [];

    service.getQuestions({ amount: 3 }).subscribe((r) => results.push(r));
    service.getQuestions({ amount: 3 }).subscribe((r) => results.push(r));

    const requests = httpMock.match((r) => r.url === 'https://opentdb.com/api.php');
    expect(requests.length).toBe(1);

    requests[0].flush({
      response_code: OpenTdbResponseCode.Success,
      results: [
        {
          category: 'History',
          type: 'boolean',
          difficulty: 'easy',
          question: 'Question 1?',
          correct_answer: 'True',
          incorrect_answers: ['False'],
        },
      ],
    });

    expect(results.length).toBe(2);
    expect(results[0][0].id).toBe(results[1][0].id);
  });

  it('rejects out-of-range amount (< 1 or > 50) without calling the network', () => {
    let capturedError: unknown;
    service.getQuestions({ amount: 0 }).subscribe({
      error: (err) => {
        capturedError = err;
      },
    });

    httpMock.expectNone('https://opentdb.com/api.php');
    expect(capturedError).toBeInstanceOf(QuizDomainError);
    expect((capturedError as QuizDomainError).code).toBe('INVALID_PARAMS');
  });
});
