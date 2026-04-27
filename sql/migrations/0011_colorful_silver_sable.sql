ALTER TABLE "processes_patents" ADD COLUMN "is_urgent" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "processes_patents" ADD COLUMN "client_request" text;--> statement-breakpoint
ALTER TABLE "processes_patents" ADD COLUMN "staff_note" text;