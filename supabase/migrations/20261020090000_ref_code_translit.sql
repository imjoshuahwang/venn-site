-- Referral codes keep accented Latin first names readable (jose-, zoe-, lukasz-). New codes only; no backfill.
create or replace function public.new_ref_code(full_name text) returns text
language plpgsql security definer set search_path = public as $$
declare
  base text := left(regexp_replace(
    replace(replace(replace(replace(translate(lower(split_part(trim(coalesce(full_name, '')), ' ', 1)),
      'àáâãäåāăąçćĉčċďđèéêëēĕėęěğĝġģĥħìíîïĩīĭįıĵķĺļľŀłñńņňòóôõöøōŏőŕŗřśŝşšșţťŧțùúûüũūŭůűųŵýÿŷźżž',
      'aaaaaaaaacccccddeeeeeeeeegggghhiiiiiiiiijklllllnnnnooooooooorrrsssssttttuuuuuuuuuuwyyyzzz'),
      'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'þ', 'th'),
    '[^a-z]', '', 'g'), 12);
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  code text;
begin
  if base = '' then base := 'venn'; end if;
  loop
    code := base || '-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
                            from generate_series(1, 6));
    exit when not exists (select 1 from public.applications where ref_code = code);
  end loop;
  return code;
end $$;
revoke execute on function public.new_ref_code(text) from public, anon, authenticated;
