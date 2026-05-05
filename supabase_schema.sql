-- ============================================================
-- AUTCHRONOS — Schema Supabase
-- Cole este arquivo no SQL Editor do seu projeto Supabase
-- ============================================================

-- 1. TABELA DE PERFIS (estende auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'viewer' CHECK (papel IN ('admin', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TRIGGER: cria perfil automaticamente ao registrar
--    O PRIMEIRO usuário a criar conta vira admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  INSERT INTO public.profiles (id, nome_completo, papel)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', split_part(NEW.email, '@', 1)),
    CASE WHEN user_count = 0 THEN 'admin' ELSE 'viewer' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. CATEGORIAS
CREATE TABLE IF NOT EXISTS public.categorias (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.categorias (nome) VALUES
  ('Elétrico'), ('Hidráulico'), ('Civil'), ('Ferramentas'), ('EPI')
ON CONFLICT (nome) DO NOTHING;

-- 4. MATERIAIS
CREATE TABLE IF NOT EXISTS public.materiais (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  unidade TEXT NOT NULL,
  estoque_minimo NUMERIC NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  valor_unitario NUMERIC NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  localizacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. MOVIMENTAÇÕES
CREATE TABLE IF NOT EXISTS public.movimentacoes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id INTEGER REFERENCES public.materiais(id) ON DELETE CASCADE,
  material_nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saída', 'ajuste')),
  quantidade NUMERIC NOT NULL CHECK (quantidade >= 0),
  data TIMESTAMPTZ DEFAULT NOW(),
  registrado_por TEXT NOT NULL,
  observacao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimentacoes ENABLE ROW LEVEL SECURITY;

-- Profiles: todos leem, cada um atualiza o próprio
CREATE POLICY "profiles_read" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Categorias: todos leem, somente admin escreve
CREATE POLICY "categorias_read" ON public.categorias
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "categorias_write_admin" ON public.categorias
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND papel = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND papel = 'admin'));

-- Materiais: todos leem e atualizam (para movimentações); somente admin insere e exclui
CREATE POLICY "materiais_read" ON public.materiais
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "materiais_update" ON public.materiais
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "materiais_insert_admin" ON public.materiais
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND papel = 'admin'));
CREATE POLICY "materiais_delete_admin" ON public.materiais
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND papel = 'admin'));

-- Movimentações: todos leem e inserem; somente admin exclui
CREATE POLICY "movimentacoes_read" ON public.movimentacoes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "movimentacoes_insert" ON public.movimentacoes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "movimentacoes_delete_admin" ON public.movimentacoes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND papel = 'admin'));
