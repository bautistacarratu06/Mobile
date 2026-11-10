import { OpenTdbCategoryOption } from '../models/quiz.models';

/**
 * Categorías oficiales conocidas de Open Trivia Database (Fase 9).
 * Nota: No todas las combinaciones de categoría + dificultad + tipo
 * disponen siempre de la cantidad solicitada de preguntas en OpenTDB.
 */
export const OPENTDB_CATEGORIES: readonly OpenTdbCategoryOption[] = [
  { id: 9, name: 'Conocimiento General (General Knowledge)' },
  { id: 10, name: 'Libros (Entertainment: Books)' },
  { id: 11, name: 'Cine (Entertainment: Film)' },
  { id: 12, name: 'Música (Entertainment: Music)' },
  { id: 14, name: 'Televisión (Entertainment: Television)' },
  { id: 15, name: 'Videojuegos (Entertainment: Video Games)' },
  { id: 17, name: 'Ciencia y Naturaleza (Science & Nature)' },
  { id: 18, name: 'Computación (Science: Computers)' },
  { id: 19, name: 'Matemáticas (Science: Mathematics)' },
  { id: 21, name: 'Deportes (Sports)' },
  { id: 22, name: 'Geografía (Geography)' },
  { id: 23, name: 'Historia (History)' },
  { id: 24, name: 'Política (Politics)' },
  { id: 25, name: 'Arte (Art)' },
  { id: 26, name: 'Celebridades (Celebrities)' },
  { id: 27, name: 'Animales (Animals)' },
  { id: 28, name: 'Vehículos (Vehicles)' },
];
