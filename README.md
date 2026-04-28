# Vero — Deploy Guide

## Rodar local

```bash
npm install
npm run dev
```
Acesse: http://localhost:5173

## Deploy no Vercel (5 minutos)

### Opção A — GitHub (recomendado)
1. Crie repositório no GitHub e suba esta pasta
2. Acesse vercel.com → New Project → Import do GitHub
3. Clique Deploy — pronto!

### Opção B — Vercel CLI
```bash
npm install -g vercel
vercel
```

## Configuração após deploy

Ao abrir o app pela primeira vez:
1. Cole o **Project URL** do Supabase
2. Cole a **Anon Key** do Supabase  
3. Crie sua conta
4. Faça o onboarding

## Supabase — Schema SQL

Execute no SQL Editor do Supabase antes de usar:

```sql
create table if not exists profiles (
  id uuid references auth.users primary key,
  email text, nome text, area text,
  horarios text, cancelamento text,
  tom text default 'informal',
  emoji text default 'às vezes',
  tratamento text default 'primeiro nome',
  created_at timestamptz default now()
);
alter table profiles enable row level security;
create policy if not exists "own profile" on profiles for all using (auth.uid()=id);

create table if not exists clients (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  name text not null, ini text, area text,
  status text default 'ativo', mrr integer default 0,
  sessions integer default 0, last_contact_days integer default 0,
  created_at timestamptz default now()
);
alter table clients enable row level security;
create policy if not exists "own clients" on clients for all using (auth.uid()=profile_id);

create table if not exists leads (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade,
  name text not null, ini text, source text,
  stage text default 'novo', interest text,
  hot boolean default false,
  created_at timestamptz default now()
);
alter table leads enable row level security;
create policy if not exists "own leads" on leads for all using (auth.uid()=profile_id);

create table if not exists settings (
  id bigserial primary key,
  profile_id uuid references profiles(id) on delete cascade unique,
  max_discount integer default 15,
  auto_learn boolean default true,
  wp_numero text, wp_tipo text default 'business',
  wp_conectado boolean default false,
  email_addr text, email_conectado boolean default false,
  persona jsonb default '{}',
  limits jsonb default '{}',
  updated_at timestamptz default now()
);
alter table settings enable row level security;
create policy if not exists "own settings" on settings for all using (auth.uid()=profile_id);
```
