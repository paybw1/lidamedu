ALTER TABLE "processes_patents" ALTER COLUMN "status" SET DEFAULT 'awaiting_payment';--> statement-breakpoint
ALTER TABLE "processes_patents" ADD COLUMN "our_ref" text NOT NULL;