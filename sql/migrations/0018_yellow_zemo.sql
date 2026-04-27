CREATE TABLE "processes_patent_alarms" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "processes_patent_alarms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"process_patent_id" uuid NOT NULL,
	"type" text NOT NULL,
	"scheduled_at" date NOT NULL,
	"is_sent" boolean DEFAULT false,
	"sent_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processes_patent_alarms" ADD CONSTRAINT "processes_patent_alarms_process_patent_id_processes_patents_id_fk" FOREIGN KEY ("process_patent_id") REFERENCES "public"."processes_patents"("id") ON DELETE cascade ON UPDATE no action;