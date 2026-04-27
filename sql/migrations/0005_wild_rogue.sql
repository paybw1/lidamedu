CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_kr" text NOT NULL,
	"name_en" text,
	"client_code" text,
	"address_kr" text,
	"address_en" text
);
--> statement-breakpoint
CREATE TABLE "inventors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name_kr" text NOT NULL,
	"name_en" text,
	"nationality" text,
	"id_number" text,
	"zipcode" text,
	"address_kr" text,
	"address_en" text,
	"residence_country" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "applicant" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "patents" ADD COLUMN "assignee" jsonb DEFAULT '[]'::jsonb;

ALTER TABLE "patents" ADD COLUMN "inventor" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "patents" ADD COLUMN "priority_rights" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "patents" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "patents" ADD COLUMN "electronic_certificate_selected" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "country_code" text;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "prior_disclosure_exception_claimed" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "prior_disclosure_documents" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "final_claim_count" integer;--> statement-breakpoint
ALTER TABLE "inventors" ADD CONSTRAINT "inventors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;