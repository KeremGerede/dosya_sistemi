#!/bin/sh
# Yalnız boş volume ile ilk başlatmada bir kez çalışır (postgres image'ının docker-entrypoint-initdb.d mekanizması).
# Roller:
#   dosya_migrator: veritabanının sahibi; şemayı yalnız Alembic migration'ı değiştirir. Superuser değildir.
#   dosya_app:      uygulamanın en az yetkili rolü; tablolarda yalnız SELECT/INSERT/UPDATE/DELETE, DDL yok.
# Parolalar sonradan değişirse bu betik tekrar çalışmaz; ALTER ROLE ile elle güncellenir (README → Production Docker).
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -v db="$POSTGRES_DB" \
    -v migrator_password="$DOSYA_MIGRATOR_PASSWORD" \
    -v app_password="$DOSYA_APP_PASSWORD" <<'SQL'
CREATE ROLE dosya_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE dosya_app LOGIN PASSWORD :'app_password';

-- PostgreSQL 15+: public şemasının sahibi pg_database_owner'dır; veritabanı sahibi olan migrator şemada nesne oluşturabilir.
ALTER DATABASE :"db" OWNER TO dosya_migrator;
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db" TO dosya_app;
GRANT USAGE ON SCHEMA public TO dosya_app;

-- Alembic'in sürüm tablosu, aşağıdaki varsayılan yetkilerden ÖNCE ve Alembic'in kendi tanımıyla oluşturulur:
-- böylece uygulama rolü migration kaydını okuyamaz ve değiştiremez. Alembic var olan tabloyu kullanır.
SET ROLE dosya_migrator;
CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);
RESET ROLE;

-- Migrator'ın ileride oluşturacağı tablo ve sequence'lere uygulama yetkisi otomatik verilir.
ALTER DEFAULT PRIVILEGES FOR ROLE dosya_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dosya_app;
ALTER DEFAULT PRIVILEGES FOR ROLE dosya_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO dosya_app;
SQL
