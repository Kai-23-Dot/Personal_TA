-- Canvas distinguishes discussions and readings from ordinary homework. The
-- classifier already returns these values, so keep the database constraint in
-- sync with the application instead of rejecting otherwise valid assignments.
ALTER TABLE public.assignments
  DROP CONSTRAINT IF EXISTS assignments_assignment_type_check;

ALTER TABLE public.assignments
  ADD CONSTRAINT assignments_assignment_type_check
  CHECK (assignment_type IN (
    'homework',
    'quiz',
    'test',
    'exam',
    'project',
    'lab',
    'essay',
    'discussion',
    'reading',
    'other'
  ));
