-- feat-9-010 확장: Q&A 대상에 체계도 노드(쟁점) 추가.
-- 조문이 여러 쟁점(신규성·진보성·확대선출원 등)에 걸릴 때, 조문 대신 쟁점(노드) 단위로
-- 질문을 특정. target_id = systematic_nodes.node_id.
alter type public.qna_target_type add value if not exists 'node';
