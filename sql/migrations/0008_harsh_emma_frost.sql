CREATE TABLE "payments_patents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"patent_id" uuid NOT NULL,
	"process_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"payment_method" text,
	"paid_at" timestamp,
	"payment_ref" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processes_patents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"step_name" text NOT NULL,
	"status" text DEFAULT 'pending',
	"attached_files" jsonb,
	"is_paid" boolean DEFAULT false,
	"paid_at" timestamp,
	"payment_method" text,
	"payment_amount" integer,
	"payment_ref" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "payments_patents" ADD CONSTRAINT "payments_patents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_patents" ADD CONSTRAINT "payments_patents_patent_id_patents_id_fk" FOREIGN KEY ("patent_id") REFERENCES "public"."patents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments_patents" ADD CONSTRAINT "payments_patents_process_id_processes_patents_id_fk" FOREIGN KEY ("process_id") REFERENCES "public"."processes_patents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes_patents" ADD CONSTRAINT "processes_patents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processes_patents" ADD CONSTRAINT "processes_patents_case_id_patents_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."patents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patents" DROP COLUMN "is_paid";--> statement-breakpoint
ALTER TABLE "patents" DROP COLUMN "paid_at";