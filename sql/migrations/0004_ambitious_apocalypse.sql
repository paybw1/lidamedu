-- Custom SQL migration file, put your code below! --

CREATE TRIGGER set_patents_updated_at -- <- name of the trigger
BEFORE UPDATE ON patents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();