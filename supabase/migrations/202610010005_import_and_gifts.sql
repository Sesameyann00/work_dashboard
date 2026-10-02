begin;

create or replace function public.update_birthday_gift(target_gift_id uuid, target_status public.gift_status)
returns public.birthday_gifts
language plpgsql security definer set search_path = '' as $$
declare result public.birthday_gifts;
begin
  if public.current_app_role() <> 'member_admin' then raise exception 'not authorized'; end if;
  update public.birthday_gifts set status=target_status,
    notified_at=case when target_status in ('notified','claimed') then coalesce(notified_at,now()) else notified_at end,
    claimed_at=case when target_status='claimed' then coalesce(claimed_at,now()) else null end
  where id=target_gift_id returning * into result;
  if result.id is null then raise exception 'gift not found'; end if;
  perform public.write_audit('birthday_gift',result.id,'status_'||target_status::text,null,to_jsonb(result));
  return result;
end $$;

create or replace function public.process_import_batch(target_batch_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; new_member_id uuid; treatment_value jsonb; latest_treatment date; cycle_id uuid; offsets int[]:=array[0,1,3,7,15,30]; names public.task_type[]:=array['care_d0','followup_d1','followup_d3','followup_d7','followup_d15','followup_d30']::public.task_type[]; i int; ok int:=0; failed int:=0; cutoff date;
begin
  if public.current_app_role() <> 'member_admin' then raise exception 'not authorized'; end if;
  select cutoff_date into cutoff from public.import_batches where id=target_batch_id for update;
  if cutoff is null then cutoff:=(now() at time zone 'Asia/Shanghai')::date; end if;
  update public.import_batches set status='importing' where id=target_batch_id;
  for r in select * from public.import_rows where batch_id=target_batch_id and status in ('valid','pending') order by row_number loop
    begin
      if coalesce(r.normalized_data->>'name','')='' or coalesce(r.normalized_data->>'phone','')='' or coalesce(r.normalized_data->>'level','') not in ('V1','V2','V3','V4','V5') then
        raise exception '姓名、手机号或会员等级无效';
      end if;
      insert into public.members(name,phone,birthday,level,joined_on,valid_until,created_by,updated_by)
      values(r.normalized_data->>'name',r.normalized_data->>'phone',nullif(r.normalized_data->>'birthday','')::date,(r.normalized_data->>'level')::public.member_level,nullif(r.normalized_data->>'joined_on','')::date,nullif(r.normalized_data->>'valid_until','')::date,auth.uid(),auth.uid())
      on conflict(normalized_phone) do update set name=excluded.name,birthday=coalesce(excluded.birthday,public.members.birthday),level=excluded.level,joined_on=coalesce(excluded.joined_on,public.members.joined_on),valid_until=coalesce(excluded.valid_until,public.members.valid_until),updated_by=auth.uid()
      returning id into new_member_id;
      latest_treatment:=null;
      for treatment_value in select value from jsonb_array_elements(coalesce(r.normalized_data->'treatments','[]'::jsonb)) loop
        insert into public.treatments(member_id,treatment_date,is_historical,import_batch_id,created_by)
        values(new_member_id,(treatment_value#>>'{}')::date,true,target_batch_id,auth.uid()) on conflict(member_id,treatment_date) do nothing;
        latest_treatment:=greatest(latest_treatment,(treatment_value#>>'{}')::date);
      end loop;
      if latest_treatment is not null and latest_treatment+30>=cutoff and not exists(select 1 from public.service_cycles where member_id=new_member_id and status='active') then
        insert into public.service_cycles(treatment_id,member_id)
        select id,new_member_id from public.treatments where member_id=new_member_id and treatment_date=latest_treatment returning id into cycle_id;
        for i in 1..array_length(offsets,1) loop
          if latest_treatment+offsets[i]>=cutoff then
            insert into public.tasks(member_id,service_cycle_id,task_type,due_date,is_historical)
            values(new_member_id,cycle_id,names[i],latest_treatment+offsets[i],true) on conflict do nothing;
          end if;
        end loop;
      end if;
      update public.import_rows set status='imported',member_id=new_member_id,error_messages='{}' where id=r.id;
      ok:=ok+1;
    exception when others then
      update public.import_rows set status='invalid',error_messages=array[sqlerrm] where id=r.id;
      failed:=failed+1;
    end;
  end loop;
  update public.import_batches set status=case when failed>0 then 'failed' else 'completed' end,success_rows=ok,failed_rows=failed,completed_at=now() where id=target_batch_id;
  return jsonb_build_object('success',ok,'failed',failed,'batch_id',target_batch_id);
end $$;

grant execute on function public.update_birthday_gift(uuid,public.gift_status) to authenticated;
grant execute on function public.process_import_batch(uuid) to authenticated;

commit;
