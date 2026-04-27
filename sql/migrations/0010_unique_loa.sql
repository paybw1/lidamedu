ALTER TABLE "patents" ALTER COLUMN "our_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "processes_patents" ALTER COLUMN "our_ref" DROP NOT NULL;