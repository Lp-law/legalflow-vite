     create table if not exists users (
       id serial primary key,
       username text unique not null,
       password_hash text not null,
       role text default 'admin'
     );

     create table if not exists transactions (
       id text primary key,
       date date not null,
       amount numeric not null,
       type text not null,
       "group" text,
       category text,
       description text,
       status text,
       payment_method text,
       client_reference text,
       is_manual_override boolean,
       is_recurring boolean
     );

     insert into users (username, password_hash, role)
     values
       ('lidor', 'changeme', 'admin'),
       ('lior', 'changeme', 'admin')
     on conflict (username) do nothing;