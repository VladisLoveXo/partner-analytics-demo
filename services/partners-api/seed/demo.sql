-- Demo partners. alpha and beta have Keycloak users, gamma is visible to the admin only.
INSERT INTO partners (id, name) VALUES
    ('alpha', 'Альфа Медиа'),
    ('beta', 'Бета Трафик'),
    ('gamma', 'Гамма Кэшбэк')
ON CONFLICT (id) DO NOTHING;
