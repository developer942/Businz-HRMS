CREATE TABLE IF NOT EXISTS public.customer_contact_id_sequences (
    company_id TEXT NOT NULL,
    sequence_year INTEGER NOT NULL,
    last_value BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, sequence_year)
);

INSERT INTO public.customer_contact_id_sequences (company_id, sequence_year, last_value)
SELECT
    company_id,
    SUBSTRING(customer_id FROM '^CUST-([0-9]{4})-')::INTEGER,
    MAX(SUBSTRING(customer_id FROM '^CUST-[0-9]{4}-([0-9]+)$')::BIGINT)
FROM public.customer_contacts
WHERE customer_id ~ '^CUST-[0-9]{4}-[0-9]+$'
GROUP BY company_id, SUBSTRING(customer_id FROM '^CUST-([0-9]{4})-')::INTEGER
ON CONFLICT (company_id, sequence_year)
DO UPDATE SET last_value = GREATEST(
    public.customer_contact_id_sequences.last_value,
    EXCLUDED.last_value
);

CREATE OR REPLACE FUNCTION public.next_customer_contact_id(p_company_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;
    next_value BIGINT;
BEGIN
    INSERT INTO public.customer_contact_id_sequences (company_id, sequence_year, last_value)
    VALUES (p_company_id, current_year, 1)
    ON CONFLICT (company_id, sequence_year)
    DO UPDATE SET last_value = public.customer_contact_id_sequences.last_value + 1
    RETURNING last_value INTO next_value;

    RETURN 'CUST-' || current_year || '-' || LPAD(next_value::TEXT, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_customer_contact_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_customer_contact_id(TEXT) TO service_role;
