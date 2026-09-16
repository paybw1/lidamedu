begin;
update problem_choices c set explanation_md = b.explanation_md
from problem_choices_expl_backup_20260916 b where b.choice_id = c.choice_id;
select count(*) as restored from problem_choices_expl_backup_20260916;
commit;
