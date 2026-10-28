CREATE TABLE "gym_task_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"task_id" text NOT NULL,
	"org_id" text NOT NULL,
	"actor_user_id" text,
	"kind" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"to_user_id" text,
	"note" text,
	"member_note" text,
	"due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "context" jsonb;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "client_key" text;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "gym_task" ADD COLUMN "feedback_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "connect_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_log" ADD COLUMN "availability" text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "gym_task_event" ADD CONSTRAINT "gym_task_event_task_id_gym_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."gym_task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task_event" ADD CONSTRAINT "gym_task_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task_event" ADD CONSTRAINT "gym_task_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_task_event" ADD CONSTRAINT "gym_task_event_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_task_event_task_idx" ON "gym_task_event" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "gym_task_event_org_idx" ON "gym_task_event" USING btree ("org_id","created_at");--> statement-breakpoint
ALTER TABLE "gym_task" ADD CONSTRAINT "gym_task_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gym_task_client_key" ON "gym_task" USING btree ("created_by","client_key") WHERE client_key is not null;--> statement-breakpoint
-- D126: el historial de REPI Connect no se edita. Sólo se permite que el borrado de una cuenta deje en NULL al autor o al
-- destinatario (procedimiento de supresión de datos, D75); cualquier otro cambio falla. Borrar filas sigue posible sólo por
-- cascada (la solicitud o la organización), que es la única vía que usa la app.
CREATE OR REPLACE FUNCTION gym_task_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.task_id IS DISTINCT FROM OLD.task_id OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.from_status IS DISTINCT FROM OLD.from_status OR NEW.to_status IS DISTINCT FROM OLD.to_status
    OR NEW.note IS DISTINCT FROM OLD.note OR NEW.member_note IS DISTINCT FROM OLD.member_note OR NEW.due_at IS DISTINCT FROM OLD.due_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id AND NEW.actor_user_id IS NOT NULL)
    OR (NEW.to_user_id IS DISTINCT FROM OLD.to_user_id AND NEW.to_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'gym_task_event es de sólo agregado';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER gym_task_event_no_update BEFORE UPDATE ON gym_task_event FOR EACH ROW EXECUTE FUNCTION gym_task_event_immutable();
