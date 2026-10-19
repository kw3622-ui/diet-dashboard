begin;

update public.food_health_tags
set food_name = case id
  when '2f10a31c-54ff-450b-8dd6-12df8dc02f83'::uuid then '국물은 건더기만 먹음'
  when '3a20a9e0-f5c0-4521-b1ad-663b7fc3cdb8'::uuid then '위스키 200ml'
  when '34c72730-7bcd-4a9f-9809-83303434e675'::uuid then '위스키 200ml'
  when '168c7f32-af68-4192-809e-b0dbfa1ade27'::uuid then '소주 600ml'
  when '939a89c5-b294-4934-91f9-eeb980d767de'::uuid then '소주 600ml'
  when 'c8b343f6-2ea7-4f0b-a91d-1e69ef6a1ab6'::uuid then '막걸리 1병 반'
  when '6620d1fe-ef2b-49a9-97c8-b5381e3c2fc1'::uuid then '막걸리 1병 반'
  when '05d09cf9-68e4-4a45-af34-812581c58b96'::uuid then '국물은 조금만 먹고'
  when '43ea175f-1633-4f18-9514-df3a631bdc87'::uuid then '밥은 반공기만'
  else food_name
end,
updated_at = now()
where id in (
  '2f10a31c-54ff-450b-8dd6-12df8dc02f83','3a20a9e0-f5c0-4521-b1ad-663b7fc3cdb8',
  '34c72730-7bcd-4a9f-9809-83303434e675','168c7f32-af68-4192-809e-b0dbfa1ade27',
  '939a89c5-b294-4934-91f9-eeb980d767de','c8b343f6-2ea7-4f0b-a91d-1e69ef6a1ab6',
  '6620d1fe-ef2b-49a9-97c8-b5381e3c2fc1','05d09cf9-68e4-4a45-af34-812581c58b96',
  '43ea175f-1633-4f18-9514-df3a631bdc87'
);

delete from public.food_health_tags
where id in (
  '437f1b7c-6972-45e2-8550-8136f38b5ab1',
  'b7cf3a7a-1b08-4a98-bbec-fb6f211d3e6b',
  '6f39d2e0-8879-4ee4-87c8-a6726f4252ab',
  '5d93d0c4-8b0c-4581-9d66-2035828fb976'
);

commit;

