# Documentos de prueba de Smart Program Import 2.0 (SI2)

Todos son **ficticios**: sin personas, gimnasios ni datos reales. Los de texto y planilla los verifica
`src/program-import.fixtures.test.ts` (valores reales del resultado, sin IA). Las fotos, la captura y el PDF necesitan la
lectura con IA: en las pruebas automáticas se simula la respuesta (`apps/web/tests/program-import.test.ts`) y en producción se
prueban con una cuenta demo.

| Archivo | Caso | Qué se espera |
| --- | --- | --- |
| `01-tres-dias.txt` | 1 | 3 días, 10 ejercicios, nada para revisar, sin IA |
| `02-seis-dias.txt` | 2 | 6 días por día de la semana |
| `03-hoja-impresa.jpg` | 3, 9, 10, 17 | Foto inclinada de una hoja impresa: 2 días. «Press inclinado manc.» 12/10/8 con 20/22/24 kg por serie; «Curl femoral» sin series (vacío y marcado, y ambiguo entre sentado y acostado); «6?» en gemelos dudoso; drop set escrito a mano |
| `04-whatsapp.txt` / `04-captura-whatsapp.png` | 4 | Conversación pegada (sin prefijos, negritas ni emojis) y captura de pantalla |
| `05-multipagina.pdf` | 5 | PDF de 2 páginas con 4 días; trae una frase dirigida a la IA que no debe tener efecto |
| `06-varias-hojas.xlsx` | 6 | Excel con 3 hojas (una por día), título arriba del encabezado, valores por serie y columnas «Serie 1, 2, 3» |
| `07-abreviaturas.txt` | 7 | «c/barra», «Ext.», «Elev.», prescripción en el renglón siguiente |
| `08-libras.txt` | 8 | Cargas en libras → kg exactos con aviso |
| `09-por-serie.txt` | 9 | Repeticiones y cargas distintas por serie, serie por serie |
| `10-sin-series.txt` | 10 | Sin series ni repeticiones: vacías y marcadas, nunca 3 × 10 |
| `13-16-metodos.txt` | 13-16 | Drop set en la última, A1/A2, circuito × 3, EMOM, AMRAP, rest-pause |
| `17-ilegible.txt` | 17 | Renglón ilegible a la vista y repeticiones «??» marcadas |
| `18-varios-programas.txt` | 18 | Dos programas: se elige cuál cargar |
| `21-limite.txt` | 21 | 25 ejercicios en un día: no se pierde ninguno; el destino lo parte y lo avisa |
| `seguridad-instrucciones.txt` | Seguridad | Instrucciones dentro del documento: quedan como texto, sin efecto |
| `planilla-libras.csv` | 6, 8, 9, 10 | Columnas en español, libras en el encabezado, valores por serie, un ejercicio sin datos |

Los casos de guardado (11-12 y 19-26: ambigüedad, ejercicio ausente, duplicado, corte de red, límites, otra organización, coach,
gimnasio, entrenar y progreso) están en `apps/web/tests/program-import.test.ts`.
