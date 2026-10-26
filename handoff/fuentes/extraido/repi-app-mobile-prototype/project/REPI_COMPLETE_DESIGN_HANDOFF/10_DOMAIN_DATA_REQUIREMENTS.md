# 10 · Modelo de dominio conceptual

No existe esquema de base de datos final. Lo siguiente es el modelo conceptual derivado de los diseños + brief original. Claude Code define la representación.

## Identidad y tenencia
User · Account · Session · **Organization** (type coach|gym, mode, settings{reviews.trainerResponses, staff.afterHoursAccess, manager.editPrograms, community.publish}) · **GymLocation** · **StaffMembership** (user, org, locations[], roles[]) · **StaffRole** (permissions[]) · **MemberRelationship** (kind gym_member|coach_client, status) · Invitation · **MemberConsent** (dataType: medidas|fotos|scan|comp|lab|ia|salud|nutricion, action store|share, grantee, purpose, granted/revoked) · **AccessAuditEvent** (actor, resource, action, result allowed|denied).

## Entrenamiento
Exercise · ExerciseMedia · MuscleGroup · Equipment · TrainingProgram · ProgramVersion · ProgramDay (nombre editable) · ProgramExercise · SetPrescription (sets, reps/rango, kg, RIR, RPE, descanso, notas) · ProgramAssignment (copia por cliente, startDate) · ProgramRevision (autor, motivo — gym) · WorkoutSession · SetLog · PersonalRecord · ClientGoal (target, actual) · ClientCheckIn (energía, sueño, RPE 1–10) · **PainReport** (zona, contexto, 0–10) · **InjuryRecord** (zona, detalle, desde, estado, restricción) · HealthProfile (condiciones, medicación, alergias, apto físico) · **NutritionLog** (comidas, kcal, macros, hidratación) + NutritionTarget · BodyMeasurement (valor, unidad, fuente, método, fecha) · ProgressPhoto (pose, cifrada) · BodyScan / AvatarModel (modo generic|adjusted|personal, estado) · CompositionReport (DXA|BIA|pliegues, documento).

## Gym operación
StaffShift (planned|active|ended) · AssistanceRequest · **OperationalTask** (category, priority, status open|pending_acceptance|done|cancelled|escalated, sanitizedSummary, source) · TaskAssignment · **ShiftHandoff** · ServiceInteraction (reviewEligible) · InstitutionalNote · PersonalStaffNote (autor) · StaffPerformanceMetric (period, category, key, value, sampleSize, definitionVersion) · MetricAttribution (shared, disputed) · **TrainerReview** (interaction único, rating, dims, text, status, response) · **ReviewModerationCase** (type content|attribution, status, resolution, log[]).

## Comunidad del gym (v3)
**GymPost** (type news|discount, title, body, badge, image) · **GymChallenge** (rule, unit reps|seg|kg, lowerIsBetter, currentRecord, holder, prize, prizePickup=reception, endsAt) · **ChallengeAttempt** (value, videoObjectKey, status pending|approved|rejected, reviewer, reason) · **MemberAchievement** (source, title, level) · **CatalogItem** (category, name, price, promo, image; informativo) · Notification.

## Comunicación
Conversation · Message · Notification · NotificationPreference · PushSubscription.

## Facturación
Coach→cliente: ClientMembership (plan, precio, vencimiento, estado) · ClientPayment (manual).
REPI SaaS: SubscriptionPlan · PricingTier · PriceVersion · **PlatformSubscription** (org, plan tiered|perUnit|fixed, tiers[], rate, fixed, minimum, discountPct, billingDay 1–28, countBasis peak|atBillingDay|average, status active|trial|paused, note) · BillingPeriod · **BillableSnapshot** (count, basis, date) · Invoice · InvoiceLine · PaymentTransaction · BillingEvent · WebhookEvent · **SubscriptionChangeLog**.

## Implicaciones de arquitectura
- **Multitenancy:** toda lectura/escritura valida pertenencia a organization y capacidad; nunca confiar en IDs del cliente.
- **Relaciones compartidas:** un User alumno puede tener MemberRelationship con gym y coach; consentimientos por relación.
- **Aislamiento de comunidad:** posts/desafíos/catálogo visibles solo a gym_member de la org (y sedes).
- **Mensajes privados:** solo participantes; gestión solo agregados.
- **Historial de entrenamiento:** pertenece al alumno; cada relación ve su porción autorizada.
- **Datos sensibles:** almacenamiento cifrado, URLs firmadas, minimización offline, sin datos de salud en notificaciones.
- **Videos de récord:** objeto privado; acceso solo a validadores de la org; retención definida.
- **Facturación:** snapshots inmutables al día de cobro; cambios de suscripción con fecha efectiva.

## Datos por pantalla
Ver columna "Datos" en `03_COMPLETE_SCREEN_INVENTORY.md` / `screens.json`.
