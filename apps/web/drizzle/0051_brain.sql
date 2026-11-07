CREATE TABLE "ai_breaker" (
	"task" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"opened_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_policy" (
	"scope" text PRIMARY KEY NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "ai_policy_scope_valid" CHECK ("ai_policy"."scope" = 'global' or "ai_policy"."scope" ~ '^(org|user):.+$')
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text,
	"org_id" text,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micros" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_outcome_valid" CHECK ("ai_usage"."outcome" is null or "ai_usage"."outcome" in ('ok', 'error', 'timeout', 'cancelled', 'refused', 'bad_output', 'budget', 'quota', 'breaker', 'concurrency', 'cache')),
	CONSTRAINT "ai_usage_counts_valid" CHECK ("ai_usage"."input_tokens" >= 0 and "ai_usage"."cached_tokens" >= 0 and "ai_usage"."output_tokens" >= 0 and "ai_usage"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "brain_action" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"autonomy" integer NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	CONSTRAINT "brain_action_status_valid" CHECK ("brain_action"."status" in ('proposed', 'confirmed', 'executed', 'failed', 'blocked', 'cancelled')),
	CONSTRAINT "brain_action_autonomy_valid" CHECK ("brain_action"."autonomy" in (0, 1, 2))
);
--> statement-breakpoint
CREATE TABLE "brain_intervention" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"priority" integer NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb,
	"program_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shown_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	CONSTRAINT "brain_intervention_channel_valid" CHECK ("brain_intervention"."channel" in ('card', 'inline', 'push')),
	CONSTRAINT "brain_intervention_status_valid" CHECK ("brain_intervention"."status" in ('pending', 'shown', 'accepted', 'dismissed', 'never', 'expired', 'cancelled', 'suppressed'))
);
--> statement-breakpoint
CREATE TABLE "brain_memory" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"ref" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "brain_memory_kind_valid" CHECK ("brain_memory"."kind" in ('preference', 'decision', 'outcome', 'temporal')),
	CONSTRAINT "brain_memory_source_valid" CHECK ("brain_memory"."source" in ('user', 'system', 'coach'))
);
--> statement-breakpoint
CREATE TABLE "brain_message" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"thread_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"cards" jsonb,
	"actions" jsonb,
	"section" text,
	"ref" jsonb,
	"via" text,
	"feedback" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_message_role_valid" CHECK ("brain_message"."role" in ('user', 'repi')),
	CONSTRAINT "brain_message_via_valid" CHECK ("brain_message"."via" is null or "brain_message"."via" in ('rules', 'ai', 'fallback', 'safety')),
	CONSTRAINT "brain_message_feedback_valid" CHECK ("brain_message"."feedback" is null or "brain_message"."feedback" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "brain_pref" (
	"user_id" text PRIMARY KEY NOT NULL,
	"proactive" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT false NOT NULL,
	"categories" jsonb DEFAULT '{"training":true,"progress":true,"performance":true,"motivation":false,"weekly":true}'::jsonb NOT NULL,
	"quiet_start" text DEFAULT '22:00' NOT NULL,
	"quiet_end" text DEFAULT '08:00' NOT NULL,
	"max_per_day" integer DEFAULT 2 NOT NULL,
	"autonomy" integer DEFAULT 1 NOT NULL,
	"tone" text DEFAULT 'normal' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brain_pref_autonomy_valid" CHECK ("brain_pref"."autonomy" in (0, 1, 2)),
	CONSTRAINT "brain_pref_tone_valid" CHECK ("brain_pref"."tone" in ('normal', 'breve')),
	CONSTRAINT "brain_pref_max_per_day_range" CHECK ("brain_pref"."max_per_day" between 0 and 10),
	CONSTRAINT "brain_pref_quiet_valid" CHECK ("brain_pref"."quiet_start" ~ '^([01]\d|2[0-3]):[0-5]\d$' and "brain_pref"."quiet_end" ~ '^([01]\d|2[0-3]):[0-5]\d$')
);
--> statement-breakpoint
CREATE TABLE "brain_thread" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ai_policy" ADD CONSTRAINT "ai_policy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_action" ADD CONSTRAINT "brain_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_intervention" ADD CONSTRAINT "brain_intervention_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_intervention" ADD CONSTRAINT "brain_intervention_program_version_id_program_version_id_fk" FOREIGN KEY ("program_version_id") REFERENCES "public"."program_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_memory" ADD CONSTRAINT "brain_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_message" ADD CONSTRAINT "brain_message_thread_id_brain_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."brain_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_message" ADD CONSTRAINT "brain_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_pref" ADD CONSTRAINT "brain_pref_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brain_thread" ADD CONSTRAINT "brain_thread_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_created_idx" ON "ai_usage" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_user_idx" ON "ai_usage" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_org_idx" ON "ai_usage" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_action_idempotency_unique" ON "brain_action" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "brain_action_user_idx" ON "brain_action" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_intervention_dedupe_unique" ON "brain_intervention" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "brain_intervention_user_idx" ON "brain_intervention" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "brain_intervention_status_idx" ON "brain_intervention" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "brain_memory_user_key_idx" ON "brain_memory" USING btree ("user_id","kind","key");--> statement-breakpoint
CREATE INDEX "brain_memory_expires_idx" ON "brain_memory" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "brain_message_thread_idx" ON "brain_message" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "brain_message_user_idx" ON "brain_message" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "brain_thread_one_open" ON "brain_thread" USING btree ("user_id") WHERE "brain_thread"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "brain_thread_user_idx" ON "brain_thread" USING btree ("user_id","created_at");