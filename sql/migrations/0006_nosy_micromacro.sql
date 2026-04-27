ALTER TABLE "entities" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "is_attorney" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "signature_image_url" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "signer_position" text NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "representative_name" text;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "is_paid" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "patents" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;