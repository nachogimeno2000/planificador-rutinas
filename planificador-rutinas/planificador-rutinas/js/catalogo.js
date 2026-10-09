// Listas de clasificación. Añade o cambia valores aquí y aparecen en toda la app.
export const ZONAS = [
  'Pecho', 'Espalda', 'Hombro', 'Bíceps', 'Tríceps', 'Antebrazo', 'Core',
  'Glúteo', 'Cuádriceps', 'Isquiosurales', 'Aductores', 'Gemelo', 'Cuerpo completo',
];

export const ESTIMULOS = [
  'SLOW', 'FAST', 'HIGH',
];

export const PLANOS = ['Sagital', 'Frontal', 'Transversal'];

export const IMPACTOS = [
  { v: 'bajo', t: 'Bajo' },
  { v: 'medio', t: 'Medio' },
  { v: 'alto', t: 'Alto' },
];

export const MATERIAL = [
  'Peso corporal', 'Mancuerna', 'Barra', 'Kettlebell', 'Polea', 'Máquina',
  'Banda elástica', 'Fitball', 'TRX', 'Banco', 'Cajón',
];

export const NIVELES = [
  { v: 'iniciacion', t: 'Iniciación' },
  { v: 'intermedio', t: 'Intermedio' },
  { v: 'avanzado', t: 'Avanzado' },
];

export const BLOQUES = [
  { v: 'calentamiento', t: 'Calentamiento' },
  { v: 'principal', t: 'Parte principal' },
  { v: 'vuelta_calma', t: 'Vuelta a la calma' },
];

// Prescripción de partida según el estímulo elegido (editable en cada ejercicio).
export const PRESCRIPCION = {
  Fuerza:      { series: 4, repeticiones: '5',    descanso_seg: 150 },
  Hipertrofia: { series: 4, repeticiones: '10',   descanso_seg: 90 },
  Potencia:    { series: 4, repeticiones: '4',    descanso_seg: 120 },
  Resistencia: { series: 3, repeticiones: '15',   descanso_seg: 45 },
  Estabilidad: { series: 3, repeticiones: '30 s', descanso_seg: 45 },
  Movilidad:   { series: 2, repeticiones: '8',    descanso_seg: 30 },
  Cardio:      { series: 3, repeticiones: '40 s', descanso_seg: 20 },
};
export const PRESCRIPCION_BASE = { series: 3, repeticiones: '10', descanso_seg: 60 };
