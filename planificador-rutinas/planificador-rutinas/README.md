# Planificador de rutinas

Biblioteca de ejercicios de gimnasio con GIF o vídeo corto, clasificados por zona muscular, tipo de estímulo, plano e impacto, y un generador de fichas de sesión: eliges en la consola cuántos ejercicios quieres y qué buscas, y la app monta la sesión en un clic. La ficha resultante se comparte por enlace y se ve bien en el móvil o impresa.

## Cómo funciona

| Pieza | Qué hace |
| --- | --- |
| **Supabase** | Base de datos, cuentas de usuario y almacenamiento de los GIF |
| **GitHub** | Guarda el código de la app |
| **Vercel** | Publica la app: cada cambio en `main` se despliega solo |

La app es HTML, CSS y JavaScript sin paso de compilación, así que Vercel la sirve tal cual.

## Secciones

- **Sesión**: la consola de la izquierda filtra por zona muscular, estímulo, plano e impacto. *Generar sesión* elige ejercicios al azar entre los que encajan, reparte el número entre las zonas marcadas y propone series, repeticiones y descanso según el estímulo. Cada ejercicio se puede reordenar, cambiar por otro equivalente o quitar.
- **Biblioteca**: alta y edición de ejercicios con su GIF o vídeo (subido a Supabase o enlazado).
- **Mis sesiones**: sesiones guardadas, para editarlas o abrir su ficha.
- **Ficha** (`/f/<código>`): la vista para el deportista. No necesita cuenta y solo se ve si la sesión está compartida.

## Estructura

```
index.html          App (acceso, sesión, biblioteca, mis sesiones)
ficha.html          Ficha pública de una sesión
css/styles.css      Estilos
js/config.js        URL y clave publicable de Supabase
js/catalogo.js      Listas de zonas, estímulos, planos, material… (edítalas aquí)
js/app.js           Lógica de la app
js/ficha.js         Lógica de la ficha pública
supabase/esquema.sql  Tablas, seguridad y almacenamiento (ya aplicado)
vercel.json         Redirección de /f/<código> a la ficha
```

## Requisitos

- Navegador actual (Chrome, Safari, Firefox, Edge).
- Para probar en local: Node.js 18 o superior y `npm run dev` (abre `http://localhost:3000`).
- No hay dependencias que instalar: la librería de Supabase se carga desde CDN.

## Puesta en marcha

1. En Vercel, importa este repositorio. Framework: *Other*. Sin comando de build ni carpeta de salida.
2. En Supabase → Authentication → URL Configuration, pon la dirección de Vercel como *Site URL* para que el correo de confirmación lleve a la app.
3. Entra en la app, crea tu cuenta y empieza a subir ejercicios.

## Consejos para los GIF

Un MP4 o WebM corto (3–6 s, sin audio, 720 px) pesa unas diez veces menos que un GIF equivalente y se reproduce igual en bucle. La ficha cargará mucho más rápido en el móvil.

## Seguridad

La clave de `js/config.js` es la publicable de Supabase, pensada para ir en el navegador. Lo que puede ver o tocar cada usuario lo deciden las políticas RLS de la base de datos: cada entrenador gestiona sus sesiones y sus ejercicios, la biblioteca es visible para todos y las fichas solo se abren por enlace si están compartidas.
