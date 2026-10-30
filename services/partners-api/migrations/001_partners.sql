CREATE TABLE partners (
    id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,30}$'),
    name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now()
);
