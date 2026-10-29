# Gym Access · QA (D127)

Casos del pedido y dónde se prueban. `T` = `apps/web/tests/gym-access.test.ts`, `D` = `packages/domain/src/gym-access.test.ts`, `N` = navegador local.

| # | Caso | Prueba | Estado |
|---|---|---|---|
| 1 | Desde casa ve rutina e historial | T «1–2» | OK |
| 2 | Híbrido: no inicia el entrenamiento del gimnasio sin validar, ni por API | T «1–2» | OK |
| 3 | QR vigente válido | T «3·8·9», N | OK |
| 4 | Sin membresía: rechazo | T «4·5·6·24», N (QR de otro gimnasio) | OK |
| 5 | QR vencido (captura vieja) | T «4·5·6·24» | OK |
| 6 | QR alterado | T «4·5·6·24» | OK |
| 7 | Ingreso de un gimnasio no sirve en otro | T «7·16·18·20» | OK |
| 8 | Varios socios con el mismo QR | T «3·8·9» | OK |
| 9 | Doble escaneo: un solo ingreso | T «3·8·9» | OK |
| 10 | Ingreso vencido no registra series nuevas | T «10·19·26» | OK |
| 11 | Baja, pausa o vigencia vencida | T «11» | OK |
| 12 | Abierto no exige nada | T «12–13», D | OK |
| 13 | Estricto sólo restringe lo configurado | T «12–13», D | OK |
| 14 | Ubicación obligatoria sin lectura → equipo | T «14·15», D | OK |
| 15 | Validación a mano con turno | T «14·15», N (pantalla) | OK |
| 16 | Dos membresías independientes | T «7·16·18·20» | OK |
| 17 | Repi Coach no cambia | T «17», N | OK |
| 18 | Sin fugas entre organizaciones | T «7·16·18·20» | OK |
| 19 | Sin conexión dentro de la vigencia se acepta | T «10·19·26» | OK |
| 20 | Datos de otros no aparecen en errores | T «7·16·18·20» | OK |
| 21 | Pantalla autorizada y revocada | T «pantalla autorizada», N (kiosco) | OK |
| 22 | Apagar el módulo vuelve al comportamiento anterior | T «apagar el módulo» | OK |
| 23 | Ubicación: precisión, antigüedad, radio | D «ubicación opcional» | OK |
| 24 | Rechazos registrados con motivo | T «4·5·6·24», N (panel) | OK |
| 25 | iPhone Safari/PWA y Android Chrome/PWA con cámara | jsQR verificado decodificando el QR renderizado; BarcodeDetector en Chrome | **Externo**: teléfonos reales (LB-03) |
| 26 | Sincronización tardía hasta 12 h | T «10·19·26», D | OK |
| 27 | Revisión legal de la ubicación | — | **Externo** |

Navegador local (28/10/2026): socio a 375 px (chip, hoja, QR propio aceptado, QR ajeno rechazado, acceso habilitado), dueño en escritorio (panel, QR a pantalla completa, crear pantalla), kiosco `/ingreso/pantalla` (secreto quitado de la URL, QR renovado, decodificado con jsQR).
