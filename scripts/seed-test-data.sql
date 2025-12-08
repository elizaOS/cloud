-- Seed test data for testing retrieve_memories MCP tool
-- This creates a complete test environment with organization, user, agent, rooms, and memories

-- 1. Create organization
INSERT INTO organizations (id, name, slug, credit_balance, is_active, created_at, updated_at)
VALUES (
  'ec42ddc9-c6bc-4306-815b-438ba59bf876',
  'Test Organization',
  'test-org',
  1000,
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 2. Create user
INSERT INTO users (id, privy_user_id, email, email_verified, name, organization_id, role, is_active, created_at, updated_at)
VALUES (
  '318fafde-d785-4990-9bda-a4a2eed8db62',
  'test-privy-id-123',
  'test@example.com',
  true,
  'Test User',
  'ec42ddc9-c6bc-4306-815b-438ba59bf876',
  'member',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 3. Create API key for testing
-- TEST_API_KEY=eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
INSERT INTO api_keys (id, organization_id, user_id, name, key, key_hash, key_prefix, is_active, created_at, updated_at)
VALUES (
  '926a821a-bb75-4eb8-b43f-05ed8ae9020c',
  'ec42ddc9-c6bc-4306-815b-438ba59bf876',
  '318fafde-d785-4990-9bda-a4a2eed8db62',
  'Test API Key',
  'eliza_test_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  '95ce372dc3b11d617cffe814801f3999c543eca1efed33a10079b88495fea19d',
  'eliza_test_',
  true,
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- 4. Create agent
INSERT INTO agents (id, name, username, enabled)
VALUES (
  'b850bc30-45f8-0041-a00a-83df46d8555d',
  'Test Agent',
  'testagent',
  true
) ON CONFLICT (id) DO NOTHING;

-- 5. Create entity for user
INSERT INTO entities (id, agent_id, names)
VALUES (
  '318fafde-d785-4990-9bda-a4a2eed8db62',
  'b850bc30-45f8-0041-a00a-83df46d8555d',
  '{"Test User"}'
) ON CONFLICT (id) DO NOTHING;

-- 6. Create entity for agent
INSERT INTO entities (id, agent_id, names)
VALUES (
  'b850bc30-45f8-0041-a00a-83df46d8555d',
  'b850bc30-45f8-0041-a00a-83df46d8555d',
  '{"Test Agent"}'
) ON CONFLICT (id) DO NOTHING;

-- 7. Create two rooms
INSERT INTO rooms (id, "agentId", source, type)
VALUES
  ('68cafd58-3f8e-4ded-a00c-d8ad7d100ab7', 'b850bc30-45f8-0041-a00a-83df46d8555d', 'mcp', 'chat'),
  ('27eaa42c-1002-44b5-b7e8-ea4a1f39ef67', 'b850bc30-45f8-0041-a00a-83df46d8555d', 'mcp', 'chat')
ON CONFLICT (id) DO NOTHING;

-- 8. Add participants (user and agent) to both rooms
INSERT INTO participants (id, "entityId", "roomId", "agentId")
VALUES
  (gen_random_uuid(), '318fafde-d785-4990-9bda-a4a2eed8db62', '68cafd58-3f8e-4ded-a00c-d8ad7d100ab7', 'b850bc30-45f8-0041-a00a-83df46d8555d'),
  (gen_random_uuid(), 'b850bc30-45f8-0041-a00a-83df46d8555d', '68cafd58-3f8e-4ded-a00c-d8ad7d100ab7', 'b850bc30-45f8-0041-a00a-83df46d8555d'),
  (gen_random_uuid(), '318fafde-d785-4990-9bda-a4a2eed8db62', '27eaa42c-1002-44b5-b7e8-ea4a1f39ef67', 'b850bc30-45f8-0041-a00a-83df46d8555d'),
  (gen_random_uuid(), 'b850bc30-45f8-0041-a00a-83df46d8555d', '27eaa42c-1002-44b5-b7e8-ea4a1f39ef67', 'b850bc30-45f8-0041-a00a-83df46d8555d')
ON CONFLICT DO NOTHING;

-- 9. Create memories in room 1 (68cafd58-3f8e-4ded-a00c-d8ad7d100ab7)
INSERT INTO memories (id, type, "createdAt", content, "entityId", "agentId", "roomId", "unique", metadata)
VALUES
  (
    '1eb82b80-252d-4e1b-80cf-5251751755f7',
    'messages',
    NOW() - INTERVAL '3 minutes',
    '{"text": "Hello, how are you?", "type": "user"}',
    '318fafde-d785-4990-9bda-a4a2eed8db62',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '68cafd58-3f8e-4ded-a00c-d8ad7d100ab7',
    true,
    '{}'
  ),
  (
    '869632f2-b73f-089d-b76c-f9f1b1ef2509',
    'messages',
    NOW() - INTERVAL '2 minutes',
    '{"text": "I am doing great! How can I help you today?", "type": "agent"}',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '68cafd58-3f8e-4ded-a00c-d8ad7d100ab7',
    true,
    '{}'
  ),
  (
    'de9e3034-8889-47bb-be0a-5c1eb3d2c308',
    'messages',
    NOW() - INTERVAL '1 minute',
    '{"text": "Can you help me test the memory retrieval system?", "type": "user"}',
    '318fafde-d785-4990-9bda-a4a2eed8db62',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '68cafd58-3f8e-4ded-a00c-d8ad7d100ab7',
    true,
    '{}'
  )
ON CONFLICT (id) DO NOTHING;

-- 10. Create memories in room 2 (27eaa42c-1002-44b5-b7e8-ea4a1f39ef67)
INSERT INTO memories (id, type, "createdAt", content, "entityId", "agentId", "roomId", "unique", metadata)
VALUES
  (
    '3eced17d-4dbc-47d5-ab8a-8a320006c2e4',
    'messages',
    NOW() - INTERVAL '5 minutes',
    '{"text": "Testing room 2", "type": "user"}',
    '318fafde-d785-4990-9bda-a4a2eed8db62',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '27eaa42c-1002-44b5-b7e8-ea4a1f39ef67',
    true,
    '{}'
  ),
  (
    'd24fdca9-ac88-0dec-927a-6182785aae32',
    'messages',
    NOW() - INTERVAL '4 minutes',
    '{"text": "Hello from room 2!", "type": "agent"}',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '27eaa42c-1002-44b5-b7e8-ea4a1f39ef67',
    true,
    '{}'
  ),
  (
    'afc55216-b506-4ed5-8f77-5ad842151ec3',
    'messages',
    NOW() - INTERVAL '3 minutes',
    '{"text": "This is a test memory in room 2", "type": "user"}',
    '318fafde-d785-4990-9bda-a4a2eed8db62',
    'b850bc30-45f8-0041-a00a-83df46d8555d',
    '27eaa42c-1002-44b5-b7e8-ea4a1f39ef67',
    true,
    '{}'
  )
ON CONFLICT (id) DO NOTHING;

-- Verify the data
SELECT 'Organizations:' as info, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'Users:', COUNT(*) FROM users
UNION ALL
SELECT 'API Keys:', COUNT(*) FROM api_keys
UNION ALL
SELECT 'Agents:', COUNT(*) FROM agents
UNION ALL
SELECT 'Entities:', COUNT(*) FROM entities
UNION ALL
SELECT 'Rooms:', COUNT(*) FROM rooms
UNION ALL
SELECT 'Participants:', COUNT(*) FROM participants
UNION ALL
SELECT 'Memories:', COUNT(*) FROM memories;
