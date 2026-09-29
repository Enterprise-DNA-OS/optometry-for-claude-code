-- Demo data for optometry-for-claude-code.
-- Lakeside Eyecare, a fictional independent practice in Ballarat, Victoria:
-- two optometrists and a dispenser, a twenty-patient book, two years of
-- examinations behind and a booked day ahead, spectacle and contact lens
-- prescriptions, frame and contact lens stock, spectacle jobs at every
-- stage, and claims to Medicare, DVA and a health fund from ready to paid.
--
-- Deliberately messy, so the attention list has something to say:
--   Daniel Kerr was examined five days ago and there is NO examination on
--     record; Priya Shah's examination from nine days ago is still in draft,
--     so her Medicare claim cannot lodge
--   Tom Nguyen is booked tomorrow as a 10910 comprehensive consult, but he
--     had one ten months ago: Medicare will reject it unless the reason for
--     a 10913 is written down or it is billed privately
--   three bulk-billed claims are ready and nobody has lodged them; DVA has
--     had Eleanor Brooks's claim for 30 days without paying; Medicare sent
--     Robert Hale's back rejected and nobody has read why
--   Priya's glasses were promised by the lab two days ago and have not come
--   Liam O'Connor's glasses have sat ready for three weeks, with $120 owing
--   Ahmed Khalil's lenses went back to the lab for a remake
--   Sofia Russo's contact lens prescription expired ten days ago and she
--     buys a box every three months: the next sale will be refused
--   Grace Kim's spectacle prescription expires in twenty days
--   Margaret Lowe (71, glaucoma suspect) is 35 days past her recall after
--     two contacts; Jack Harper's diabetic eye check is 15 days overdue and
--     he never agreed to messages, so he is a phone call
--   Acuvue Oasys and the Biotrue solution are under their reorder points,
--     and six Lafont frames have sat unsold for over a year
--
-- Dates are relative to current_date so the demo is coherent whatever day
-- you run it. Ids derive from names with seed_uuid, and every insert is
-- ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
-- Optometrists, patients, fees, item amounts and events are DEMO VALUES for
-- a fictional business. Load your own fee schedule before you claim
-- anything. No real person or business is depicted.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

update settings set value = 'Lakeside Eyecare' where key = 'practice_name';

-- The team -----------------------------------------------------------------------------

insert into optometrists (id, name, provider_number, registration_no, therapeutic, days, starts_at, ends_at) values
  (seed_uuid('opt:hannah'), 'Hannah Webb', '2451736A', 'OPT0001234567', true,  'mon,tue,wed,thu,fri',     '09:00', '17:30'),
  (seed_uuid('opt:arjun'),  'Arjun Rao',   '2459921B', 'OPT0002345678', false, 'tue,wed,thu,fri,sat,sun', '09:00', '17:00')
on conflict (id) do nothing;

-- Services (demo fees; load your own) ----------------------------------------------------

insert into services (id, code, name, kind, minutes, fee_cents, mbs_item) values
  (seed_uuid('svc:ce-u65'), 'CE',    'Comprehensive eye examination',            'consult',      30,  7200, '10910'),
  (seed_uuid('svc:ce-65'),  'CE65',  'Comprehensive eye examination (65 and over)', 'consult',   30,  7200, '10911'),
  (seed_uuid('svc:diab'),   'DIAB',  'Diabetic eye examination (dilated)',       'consult',      40,  7200, '10915'),
  (seed_uuid('svc:review'), 'REV',   'Review consultation',                      'consult',      20,  3600, '10918'),
  (seed_uuid('svc:short'),  'SHORT', 'Short consultation',                       'consult',      15,  3600, '10916'),
  (seed_uuid('svc:clfit'),  'CLFIT', 'Contact lens fitting',                     'contact_lens', 45, 12000, null),
  (seed_uuid('svc:clac'),   'CLAC',  'Contact lens aftercare',                   'contact_lens', 20,  5500, null),
  (seed_uuid('svc:disp'),   'DISP',  'Spectacle collection and fitting',         'dispense',     15,     0, null)
on conflict (id) do nothing;

-- Patients -----------------------------------------------------------------------------

insert into patients (id, name, date_of_birth, phone, email, medicare_number, health_fund, health_fund_no, dva_number, diabetic, conditions, marketing_opt_in) values
  (seed_uuid('pt:margaret'), 'Margaret Lowe',   current_date - interval '71 years 40 days',  '0412 118 402', 'mlowe@example.com',   '2123 45670 1', 'HCF',     '4401928', null,        false, 'glaucoma suspect', true),
  (seed_uuid('pt:tom'),      'Tom Nguyen',      current_date - interval '34 years 90 days',  '0413 220 781', 'tom.n@example.com',   '2234 56781 1', 'Bupa',    '88120431', null,       false, null, true),
  (seed_uuid('pt:sofia'),    'Sofia Russo',     current_date - interval '28 years 12 days',  '0414 330 912', 'sofia.r@example.com', '2345 67892 1', 'Medibank','5581204', null,        false, null, true),
  (seed_uuid('pt:jack'),     'Jack Harper',     current_date - interval '52 years 200 days', '0415 441 023', null,                  '2456 78903 1', null,      null,      null,        true,  'type 2 diabetes', null),
  (seed_uuid('pt:priya'),    'Priya Shah',      current_date - interval '45 years 61 days',  '0416 552 134', 'priya.s@example.com', '2567 89014 1', 'HCF',     '4410231', null,        false, null, true),
  (seed_uuid('pt:daniel'),   'Daniel Kerr',     current_date - interval '60 years 150 days', '0417 663 245', 'dkerr@example.com',   '2678 90125 1', null,      null,      null,        false, null, false),
  (seed_uuid('pt:eleanor'),  'Eleanor Brooks',  current_date - interval '82 years 30 days',  '03 5331 2290', null,                  '2789 01236 1', null,      null,      'VX123456',  false, 'early cataract', null),
  (seed_uuid('pt:liam'),     'Liam O''Connor',  current_date - interval '39 years 5 days',   '0418 774 356', 'liam.oc@example.com', '2890 12347 1', 'nib',     '7712093', null,        false, null, true),
  (seed_uuid('pt:grace'),    'Grace Kim',       current_date - interval '22 years 70 days',  '0419 885 467', 'grace.k@example.com', '2901 23458 1', null,      null,      null,        false, null, true),
  (seed_uuid('pt:robert'),   'Robert Hale',     current_date - interval '58 years 110 days', '0420 996 578', 'rhale@example.com',   '3012 34569 1', null,      null,      null,        false, null, false),
  (seed_uuid('pt:chloe'),    'Chloe Martin',    current_date - interval '31 years 220 days', '0421 107 689', 'chloe.m@example.com', '3123 45670 2', 'Bupa',    '88341092', null,       false, null, true),
  (seed_uuid('pt:ahmed'),    'Ahmed Khalil',    current_date - interval '48 years 18 days',  '0422 218 790', 'ahmed.k@example.com', '3234 56781 2', 'HCF',     '4420871', null,        false, null, true),
  (seed_uuid('pt:isla'),     'Isla Ward',       current_date - interval '9 years 100 days',  '0423 329 801', 'ward.family@example.com', '3345 67892 3', null, null,     null,        false, 'myopia, progressing', true),
  (seed_uuid('pt:peter'),    'Peter Walsh',     current_date - interval '76 years 260 days', '03 5332 7781', null,                  '3456 78903 1', null,      null,      null,        false, 'AMD, dry, left eye', null),
  (seed_uuid('pt:nora'),     'Nora Fitzgerald', current_date - interval '55 years 45 days',  '0424 430 912', 'nora.f@example.com',  '3567 89014 1', 'Medibank','5590412', null,        false, null, true),
  (seed_uuid('pt:kate'),     'Kate Delaney',    current_date - interval '41 years 300 days', '0425 541 023', 'kate.d@example.com',  '3678 90125 1', null,      null,      null,        false, null, true),
  (seed_uuid('pt:sam'),      'Sam Oduya',       current_date - interval '26 years 10 days',  '0426 652 134', 'sam.o@example.com',   '3789 01236 1', null,      null,      null,        false, null, false),
  (seed_uuid('pt:helen'),    'Helen Park',      current_date - interval '63 years 80 days',  '0427 763 245', 'helen.p@example.com', '3890 12347 1', 'nib',     '7720981', null,        false, null, true),
  (seed_uuid('pt:marcus'),   'Marcus Bell',     current_date - interval '36 years 140 days', '0428 874 356', 'marcus.b@example.com','3901 23458 1', null,      null,      null,        false, null, true),
  (seed_uuid('pt:ruby'),     'Ruby Chen',       current_date - interval '19 years 250 days', '0429 985 467', 'ruby.c@example.com',  '4012 34569 1', null,      null,      null,        false, null, true)
on conflict (id) do nothing;

-- Appointments (completed history, and the booked day ahead) -------------------------------------------

insert into appointments (id, ref, patient_id, optometrist_id, service_id, on_date, starts_at, ends_at, status, reason) values
  (seed_uuid('apt:1001'), 'APT-1001', seed_uuid('pt:nora'),     seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 6,   '09:30', '10:00', 'completed', 'blurry reading'),
  (seed_uuid('apt:1002'), 'APT-1002', seed_uuid('pt:chloe'),    seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 10,  '10:00', '10:30', 'completed', 'routine'),
  (seed_uuid('apt:1003'), 'APT-1003', seed_uuid('pt:priya'),    seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 9,   '11:00', '11:30', 'completed', 'new glasses'),
  (seed_uuid('apt:1004'), 'APT-1004', seed_uuid('pt:daniel'),   seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 5,   '14:00', '14:30', 'completed', 'headaches at the screen'),
  (seed_uuid('apt:1005'), 'APT-1005', seed_uuid('pt:eleanor'),  seed_uuid('opt:hannah'), seed_uuid('svc:ce-65'),  current_date - 35,  '10:00', '10:30', 'completed', 'cataract monitoring'),
  (seed_uuid('apt:1006'), 'APT-1006', seed_uuid('pt:robert'),   seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 25,  '15:00', '15:30', 'completed', 'new to the practice'),
  (seed_uuid('apt:1007'), 'APT-1007', seed_uuid('pt:liam'),     seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 40,  '09:00', '09:30', 'completed', 'routine'),
  (seed_uuid('apt:1008'), 'APT-1008', seed_uuid('pt:ahmed'),    seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 20,  '13:00', '13:30', 'completed', 'progressive lenses'),
  (seed_uuid('apt:1009'), 'APT-1009', seed_uuid('pt:grace'),    seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 710, '16:00', '16:30', 'completed', 'first glasses'),
  (seed_uuid('apt:1010'), 'APT-1010', seed_uuid('pt:sofia'),    seed_uuid('opt:hannah'), seed_uuid('svc:clac'),   current_date - 375, '12:00', '12:20', 'completed', 'contact lens aftercare'),
  (seed_uuid('apt:1011'), 'APT-1011', seed_uuid('pt:margaret'), seed_uuid('opt:hannah'), seed_uuid('svc:ce-65'),  current_date - 400, '10:30', '11:00', 'completed', 'glaucoma suspect review'),
  (seed_uuid('apt:1012'), 'APT-1012', seed_uuid('pt:jack'),     seed_uuid('opt:hannah'), seed_uuid('svc:diab'),   current_date - 380, '11:00', '11:40', 'completed', 'diabetic eye check'),
  (seed_uuid('apt:1013'), 'APT-1013', seed_uuid('pt:isla'),     seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 355, '15:30', '16:00', 'completed', 'school vision screening referral'),
  (seed_uuid('apt:1014'), 'APT-1014', seed_uuid('pt:tom'),      seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 300, '10:00', '10:30', 'completed', 'routine'),
  (seed_uuid('apt:1015'), 'APT-1015', seed_uuid('pt:peter'),    seed_uuid('opt:hannah'), seed_uuid('svc:ce-65'),  current_date - 400, '14:00', '14:30', 'completed', 'AMD review'),
  (seed_uuid('apt:1016'), 'APT-1016', seed_uuid('pt:kate'),     seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 2,   '11:00', '11:30', 'completed', 'routine'),
  (seed_uuid('apt:1017'), 'APT-1017', seed_uuid('pt:sam'),      seed_uuid('opt:arjun'),  seed_uuid('svc:short'),  current_date - 1,   '12:00', '12:15', 'completed', 'red eye'),
  (seed_uuid('apt:1018'), 'APT-1018', seed_uuid('pt:helen'),    seed_uuid('opt:hannah'), seed_uuid('svc:ce-u65'), current_date - 60,  '09:30', '10:00', 'completed', 'routine'),
  (seed_uuid('apt:1019'), 'APT-1019', seed_uuid('pt:marcus'),   seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 45,  '10:30', '11:00', 'completed', 'routine'),
  (seed_uuid('apt:1020'), 'APT-1020', seed_uuid('pt:ruby'),     seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date - 30,  '14:30', '15:00', 'completed', 'routine'),
  -- the day ahead
  (seed_uuid('apt:1021'), 'APT-1021', seed_uuid('pt:tom'),      seed_uuid('opt:arjun'),  seed_uuid('svc:ce-u65'), current_date + 1,   '10:00', '10:30', 'booked',    'eyes tired at work'),
  (seed_uuid('apt:1022'), 'APT-1022', seed_uuid('pt:peter'),    seed_uuid('opt:hannah'), seed_uuid('svc:ce-65'),  current_date + 1,   '11:00', '11:30', 'confirmed', 'annual AMD review'),
  (seed_uuid('apt:1023'), 'APT-1023', seed_uuid('pt:ahmed'),    null,                    seed_uuid('svc:disp'),   current_date + 3,   '16:00', '16:15', 'confirmed', 'collect remade progressives')
on conflict (id) do nothing;

-- Examinations -------------------------------------------------------------------------

insert into exams (id, ref, appointment_id, patient_id, optometrist_id, on_date, mbs_item, billing, item_reason, dilated, va_right, va_left, iop_right, iop_left, history, findings, management, recall_months, recall_kind, status, finalised_at) values
  (seed_uuid('exm:501'), 'EXM-501', seed_uuid('apt:1001'), seed_uuid('pt:nora'),     seed_uuid('opt:hannah'), current_date - 6,   '10910', 'bulk', null, false, '6/6',   '6/6',   15, 16, 'Struggling with menus and her phone.', 'Presbyopia. Healthy anterior and posterior eyes.', 'Readers +1.50. Review 2 years.', 24, 'eye examination', 'final', now() - interval '6 days'),
  (seed_uuid('exm:502'), 'EXM-502', seed_uuid('apt:1002'), seed_uuid('pt:chloe'),    seed_uuid('opt:arjun'),  current_date - 10,  '10910', 'bulk', null, false, '6/9',   '6/7.5', 14, 14, 'Distance blur driving at night.', 'Low myopia, small change. Healthy eyes.', 'New spectacle Rx given. Review 2 years.', 24, 'eye examination', 'final', now() - interval '10 days'),
  (seed_uuid('exm:503'), 'EXM-503', seed_uuid('apt:1003'), seed_uuid('pt:priya'),    seed_uuid('opt:arjun'),  current_date - 9,   '10910', 'bulk', null, false, '6/6',   '6/6',   17, 16, 'Wants progressives for work.', 'Early presbyopia.', null, 24, 'eye examination', 'draft', null),
  (seed_uuid('exm:504'), 'EXM-504', seed_uuid('apt:1005'), seed_uuid('pt:eleanor'),  seed_uuid('opt:hannah'), current_date - 35,  '10911', 'dva',  null, true,  '6/12',  '6/9',   18, 17, 'Glare driving at dusk.', 'Nuclear sclerosis both eyes, right worse.', 'Monitor. Refer for cataract assessment if VA drops below 6/12 in the left eye.', 12, 'cataract review', 'final', now() - interval '35 days'),
  (seed_uuid('exm:505'), 'EXM-505', seed_uuid('apt:1006'), seed_uuid('pt:robert'),   seed_uuid('opt:arjun'),  current_date - 25,  '10910', 'bulk', null, false, '6/6',   '6/6',   13, 13, 'New to the practice. Last test "a while ago" elsewhere.', 'Healthy eyes, stable Rx.', 'No change. Review 2 years.', 24, 'eye examination', 'final', now() - interval '25 days'),
  (seed_uuid('exm:506'), 'EXM-506', seed_uuid('apt:1007'), seed_uuid('pt:liam'),     seed_uuid('opt:hannah'), current_date - 40,  '10910', 'bulk', null, false, '6/9',   '6/9',   15, 15, 'Screen fatigue.', 'Low astigmatism.', 'New spectacle Rx for computer and distance.', 24, 'eye examination', 'final', now() - interval '40 days'),
  (seed_uuid('exm:507'), 'EXM-507', seed_uuid('apt:1008'), seed_uuid('pt:ahmed'),    seed_uuid('opt:arjun'),  current_date - 20,  '10910', 'bulk', null, false, '6/6',   '6/7.5', 16, 16, 'Needs progressives.', 'Presbyopia with low hyperopia.', 'Progressive Rx given.', 24, 'eye examination', 'final', now() - interval '20 days'),
  (seed_uuid('exm:508'), 'EXM-508', seed_uuid('apt:1009'), seed_uuid('pt:grace'),    seed_uuid('opt:hannah'), current_date - 710, '10910', 'bulk', null, false, '6/12',  '6/12',  12, 12, 'Board blurry at uni.', 'Myopia.', 'First glasses.', 24, 'eye examination', 'final', now() - interval '710 days'),
  (seed_uuid('exm:509'), 'EXM-509', seed_uuid('apt:1010'), seed_uuid('pt:sofia'),    seed_uuid('opt:hannah'), current_date - 375, null,    'private', null, false, '6/6', '6/6',  null, null, 'Monthly lenses, comfortable.', 'Good fit, clear corneas.', 'Continue. Aftercare in 12 months.', 12, 'contact lens aftercare', 'final', now() - interval '375 days'),
  (seed_uuid('exm:510'), 'EXM-510', seed_uuid('apt:1011'), seed_uuid('pt:margaret'), seed_uuid('opt:hannah'), current_date - 400, '10911', 'bulk', null, true,  '6/7.5', '6/7.5', 22, 23, 'Mother had glaucoma.', 'Cup to disc 0.6 both eyes, fields full.', 'Glaucoma suspect. Fields and OCT in 12 months.', 12, 'glaucoma review', 'final', now() - interval '400 days'),
  (seed_uuid('exm:511'), 'EXM-511', seed_uuid('apt:1012'), seed_uuid('pt:jack'),     seed_uuid('opt:hannah'), current_date - 380, '10915', 'bulk', null, true,  '6/6',   '6/6',   16, 16, 'Type 2 diabetes, HbA1c 7.4.', 'No diabetic retinopathy.', 'Report to GP. Dilated review in 12 months.', 12, 'diabetic eye examination', 'final', now() - interval '380 days'),
  (seed_uuid('exm:512'), 'EXM-512', seed_uuid('apt:1013'), seed_uuid('pt:isla'),     seed_uuid('opt:arjun'),  current_date - 355, '10910', 'bulk', null, false, '6/12',  '6/9',   null, null, 'Squinting at the board.', 'Myopia, -1.25.', 'First glasses. Review 12 months for progression.', 12, 'myopia review', 'final', now() - interval '355 days'),
  (seed_uuid('exm:513'), 'EXM-513', seed_uuid('apt:1014'), seed_uuid('pt:tom'),      seed_uuid('opt:arjun'),  current_date - 300, '10910', 'bulk', null, false, '6/6',   '6/6',   14, 15, 'Routine.', 'Healthy eyes.', 'No Rx needed.', 24, 'eye examination', 'final', now() - interval '300 days'),
  (seed_uuid('exm:514'), 'EXM-514', seed_uuid('apt:1015'), seed_uuid('pt:peter'),    seed_uuid('opt:hannah'), current_date - 400, '10911', 'bulk', null, true,  '6/9',   '6/18',  15, 16, 'Straight lines wavy left eye? No.', 'Dry AMD left eye, stable drusen.', 'Amsler grid at home. Review 12 months.', 12, 'AMD review', 'final', now() - interval '400 days'),
  (seed_uuid('exm:515'), 'EXM-515', seed_uuid('apt:1016'), seed_uuid('pt:kate'),     seed_uuid('opt:hannah'), current_date - 2,   '10910', 'bulk', null, false, '6/6',   '6/6',   14, 14, 'Routine.', 'Healthy eyes.', 'No change.', 24, 'eye examination', 'final', now() - interval '2 days'),
  (seed_uuid('exm:516'), 'EXM-516', seed_uuid('apt:1017'), seed_uuid('pt:sam'),      seed_uuid('opt:arjun'),  current_date - 1,   '10916', 'bulk', null, false, '6/6',   '6/6',   null, null, 'Red right eye two days.', 'Mild viral conjunctivitis.', 'Cold compresses, lubricants. Return if worse.', null, null, 'final', now() - interval '1 day'),
  (seed_uuid('exm:517'), 'EXM-517', seed_uuid('apt:1018'), seed_uuid('pt:helen'),    seed_uuid('opt:hannah'), current_date - 60,  '10910', 'bulk', null, false, '6/9',   '6/9',   15, 15, 'Reading harder.', 'Presbyopia progressing.', 'New progressive Rx.', 24, 'eye examination', 'final', now() - interval '60 days'),
  (seed_uuid('exm:518'), 'EXM-518', seed_uuid('apt:1019'), seed_uuid('pt:marcus'),   seed_uuid('opt:arjun'),  current_date - 45,  '10910', 'bulk', null, false, '6/9',   '6/9',   14, 14, 'Routine.', 'Low myopia.', 'New Rx.', 24, 'eye examination', 'final', now() - interval '45 days'),
  (seed_uuid('exm:519'), 'EXM-519', seed_uuid('apt:1020'), seed_uuid('pt:ruby'),     seed_uuid('opt:arjun'),  current_date - 30,  '10910', 'bulk', null, false, '6/9',   '6/12',  13, 13, 'Routine.', 'Myopia, small increase.', 'New Rx.', 24, 'eye examination', 'final', now() - interval '30 days')
on conflict (id) do nothing;

-- Prescriptions ------------------------------------------------------------------------

insert into prescriptions (id, ref, patient_id, exam_id, optometrist_id, kind, issued_on, expires_on, r_sph, r_cyl, r_axis, r_add, l_sph, l_cyl, l_axis, l_add, pd, lens, status) values
  (seed_uuid('rx:701'), 'RX-701', seed_uuid('pt:chloe'),  seed_uuid('exm:502'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 10,  current_date + 720, -1.25, -0.25, 180, null,  -1.00, null,  null, null,  '62', null, 'active'),
  (seed_uuid('rx:702'), 'RX-702', seed_uuid('pt:priya'),  seed_uuid('exm:503'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 9,   current_date + 721, 0.50,  null,  null, 1.50,  0.75,  -0.25, 90,   1.50,  '63', null, 'active'),
  (seed_uuid('rx:703'), 'RX-703', seed_uuid('pt:liam'),   seed_uuid('exm:506'), seed_uuid('opt:hannah'), 'spectacle',    current_date - 40,  current_date + 690, -0.25, -0.75, 170, null,  -0.25, -0.50, 10,   null,  '64', null, 'active'),
  (seed_uuid('rx:704'), 'RX-704', seed_uuid('pt:ahmed'),  seed_uuid('exm:507'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 20,  current_date + 710, 1.00,  null,  null, 2.00,  1.25,  -0.25, 95,   2.00,  '66', null, 'active'),
  (seed_uuid('rx:705'), 'RX-705', seed_uuid('pt:grace'),  seed_uuid('exm:508'), seed_uuid('opt:hannah'), 'spectacle',    current_date - 710, current_date + 20,  -2.00, null,  null, null,  -2.25, null,  null, null,  '60', null, 'active'),
  (seed_uuid('rx:706'), 'RX-706', seed_uuid('pt:sofia'),  seed_uuid('exm:509'), seed_uuid('opt:hannah'), 'contact_lens', current_date - 375, current_date - 10,  -3.00, null,  null, null,  -3.25, null,  null, null,  null, 'Dailies Total1 BC 8.5 DIA 14.1, daily disposable', 'active'),
  (seed_uuid('rx:707'), 'RX-707', seed_uuid('pt:isla'),   seed_uuid('exm:512'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 355, current_date + 10,  -1.25, null,  null, null,  -1.00, null,  null, null,  '54', null, 'active'),
  (seed_uuid('rx:708'), 'RX-708', seed_uuid('pt:helen'),  seed_uuid('exm:517'), seed_uuid('opt:hannah'), 'spectacle',    current_date - 60,  current_date + 670, 0.75,  null,  null, 2.25,  0.75,  null,  null, 2.25,  '61', null, 'active'),
  (seed_uuid('rx:709'), 'RX-709', seed_uuid('pt:marcus'), seed_uuid('exm:518'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 45,  current_date + 685, -0.75, null,  null, null,  -0.75, -0.25, 180,  null,  '65', null, 'active'),
  (seed_uuid('rx:710'), 'RX-710', seed_uuid('pt:ruby'),   seed_uuid('exm:519'), seed_uuid('opt:arjun'),  'spectacle',    current_date - 30,  current_date + 700, -2.75, null,  null, null,  -3.00, null,  null, null,  '59', null, 'active')
on conflict (id) do nothing;

-- Stock ----------------------------------------------------------------------------------

insert into stock (id, sku, kind, brand, name, colour, size, cost_cents, retail_cents, on_hand, reorder_at, received_on) values
  (seed_uuid('stk:rb5154'),  'FR-RB5154-49',   'frame',        'Ray-Ban',   'Clubmaster RB5154',   'black/gold',   '49-21', 9200, 27900, 3, 1, current_date - 200),
  (seed_uuid('stk:oak8156'), 'FR-OX8156-54',   'frame',        'Oakley',    'Holbrook RX OX8156',  'satin black',  '54-18', 8800, 25900, 2, 1, current_date - 150),
  (seed_uuid('stk:tf5634'),  'FR-TF5634-53',   'frame',        'Tom Ford',  'FT5634-B',            'havana',       '53-18', 16500, 49500, 1, 1, current_date - 90),
  (seed_uuid('stk:lafont'),  'FR-LAF-AURORA',  'frame',        'Lafont',    'Aurora',              'rose',         '51-17', 14000, 42000, 6, 1, current_date - 420),
  (seed_uuid('stk:house1'),  'FR-LSE-001',     'frame',        'Lakeside',  'House range 001',     'crystal',      '52-19', 2200, 12900, 12, 4, current_date - 60),
  (seed_uuid('stk:house2'),  'FR-LSE-002',     'frame',        'Lakeside',  'House range 002',     'tortoise',     '50-20', 2200, 12900, 9, 4, current_date - 60),
  (seed_uuid('stk:oasys'),   'CL-OASYS-6',     'contact_lens', 'Acuvue',    'Oasys 6 pack',        null,           null,    2400, 5900, 2, 4, current_date - 70),
  (seed_uuid('stk:dt1'),     'CL-DT1-90',      'contact_lens', 'Alcon',     'Dailies Total1 90 pack', null,        null,    8500, 18900, 10, 3, current_date - 40),
  (seed_uuid('stk:biotrue'), 'SOL-BIOTRUE-300','solution',     'Bausch + Lomb', 'Biotrue 300ml',   null,           null,    900,  2400, 1, 3, current_date - 120),
  (seed_uuid('stk:cloth'),   'ACC-CLOTH',      'accessory',    'Lakeside',  'Lens cloth and case', null,           null,    150,  900, 40, 10, current_date - 100)
on conflict (id) do nothing;

-- Invoices, items, payments ---------------------------------------------------------------

insert into invoices (id, ref, patient_id, payer, issued_on, due_on, status) values
  (seed_uuid('inv:2001'), 'INV-2001', seed_uuid('pt:nora'),    'medicare', current_date - 6,   current_date - 6,  'sent'),
  (seed_uuid('inv:2002'), 'INV-2002', seed_uuid('pt:chloe'),   'medicare', current_date - 10,  current_date - 10, 'paid'),
  (seed_uuid('inv:2003'), 'INV-2003', seed_uuid('pt:priya'),   'medicare', current_date - 9,   current_date - 9,  'sent'),
  (seed_uuid('inv:2004'), 'INV-2004', seed_uuid('pt:eleanor'), 'dva',      current_date - 35,  current_date - 35, 'sent'),
  (seed_uuid('inv:2005'), 'INV-2005', seed_uuid('pt:robert'),  'medicare', current_date - 25,  current_date - 25, 'sent'),
  (seed_uuid('inv:2006'), 'INV-2006', seed_uuid('pt:liam'),    'medicare', current_date - 40,  current_date - 40, 'paid'),
  (seed_uuid('inv:2007'), 'INV-2007', seed_uuid('pt:ahmed'),   'medicare', current_date - 20,  current_date - 20, 'paid'),
  (seed_uuid('inv:2008'), 'INV-2008', seed_uuid('pt:kate'),    'medicare', current_date - 2,   current_date - 2,  'sent'),
  (seed_uuid('inv:2009'), 'INV-2009', seed_uuid('pt:sam'),     'medicare', current_date - 1,   current_date - 1,  'sent'),
  (seed_uuid('inv:2010'), 'INV-2010', seed_uuid('pt:helen'),   'medicare', current_date - 60,  current_date - 60, 'paid'),
  (seed_uuid('inv:2011'), 'INV-2011', seed_uuid('pt:marcus'),  'medicare', current_date - 45,  current_date - 45, 'paid'),
  (seed_uuid('inv:2012'), 'INV-2012', seed_uuid('pt:ruby'),    'medicare', current_date - 30,  current_date - 30, 'paid'),
  -- eyewear and contact lenses, to the patient
  (seed_uuid('inv:2101'), 'INV-2101', seed_uuid('pt:priya'),   'patient',  current_date - 9,   current_date + 3,  'sent'),
  (seed_uuid('inv:2102'), 'INV-2102', seed_uuid('pt:liam'),    'patient',  current_date - 35,  current_date - 21, 'sent'),
  (seed_uuid('inv:2103'), 'INV-2103', seed_uuid('pt:ahmed'),   'patient',  current_date - 20,  current_date - 10, 'paid'),
  (seed_uuid('inv:2104'), 'INV-2104', seed_uuid('pt:sofia'),   'patient',  current_date - 60,  current_date - 60, 'paid'),
  (seed_uuid('inv:2105'), 'INV-2105', seed_uuid('pt:helen'),   'patient',  current_date - 58,  current_date - 44, 'paid'),
  (seed_uuid('inv:2106'), 'INV-2106', seed_uuid('pt:ruby'),    'patient',  current_date - 30,  current_date - 16, 'paid'),
  (seed_uuid('inv:2107'), 'INV-2107', seed_uuid('pt:sofia'),   'patient',  current_date - 150, current_date - 150,'paid')
on conflict (id) do nothing;

insert into invoice_items (id, invoice_id, description, qty, unit_cents, mbs_item, stock_id) values
  (seed_uuid('ii:2001'), seed_uuid('inv:2001'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2002'), seed_uuid('inv:2002'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2003'), seed_uuid('inv:2003'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2004'), seed_uuid('inv:2004'), 'Comprehensive eye examination (MBS 10911), DVA', 1, 7200, '10911', null),
  (seed_uuid('ii:2005'), seed_uuid('inv:2005'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2006'), seed_uuid('inv:2006'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2007'), seed_uuid('inv:2007'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2008'), seed_uuid('inv:2008'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2009'), seed_uuid('inv:2009'), 'Short consultation (MBS 10916)', 1, 3600, '10916', null),
  (seed_uuid('ii:2010'), seed_uuid('inv:2010'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2011'), seed_uuid('inv:2011'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2012'), seed_uuid('inv:2012'), 'Comprehensive eye examination (MBS 10910)', 1, 7200, '10910', null),
  (seed_uuid('ii:2101'), seed_uuid('inv:2101'), 'Spectacles: Ray-Ban Clubmaster RB5154 with progressive lenses (JOB-3001)', 1, 64900, null, null),
  (seed_uuid('ii:2102'), seed_uuid('inv:2102'), 'Spectacles: Oakley Holbrook RX with single vision blue-light lenses (JOB-3002)', 1, 48000, null, null),
  (seed_uuid('ii:2103'), seed_uuid('inv:2103'), 'Spectacles: own frame, progressive lenses (JOB-3003)', 1, 39000, null, null),
  (seed_uuid('ii:2104'), seed_uuid('inv:2104'), 'Alcon Dailies Total1 90 pack', 1, 18900, null, seed_uuid('stk:dt1')),
  (seed_uuid('ii:2105'), seed_uuid('inv:2105'), 'Spectacles: Lakeside house range 001 with progressive lenses (JOB-2990)', 1, 52900, null, null),
  (seed_uuid('ii:2106'), seed_uuid('inv:2106'), 'Spectacles: Lakeside house range 002 with single vision lenses (JOB-2995)', 1, 29900, null, null),
  (seed_uuid('ii:2107'), seed_uuid('inv:2107'), 'Alcon Dailies Total1 90 pack', 1, 18900, null, seed_uuid('stk:dt1'))
on conflict (id) do nothing;

insert into payments (id, invoice_id, amount_cents, method, paid_on) values
  (seed_uuid('pay:2002'), seed_uuid('inv:2002'), 7200,  'medicare', current_date - 4),
  (seed_uuid('pay:2006'), seed_uuid('inv:2006'), 7200,  'medicare', current_date - 33),
  (seed_uuid('pay:2007'), seed_uuid('inv:2007'), 7200,  'medicare', current_date - 13),
  (seed_uuid('pay:2010'), seed_uuid('inv:2010'), 7200,  'medicare', current_date - 53),
  (seed_uuid('pay:2011'), seed_uuid('inv:2011'), 7200,  'medicare', current_date - 38),
  (seed_uuid('pay:2012'), seed_uuid('inv:2012'), 7200,  'medicare', current_date - 23),
  (seed_uuid('pay:2101'), seed_uuid('inv:2101'), 30000, 'eftpos',   current_date - 9),
  (seed_uuid('pay:2102'), seed_uuid('inv:2102'), 36000, 'eftpos',   current_date - 35),
  (seed_uuid('pay:2103a'),seed_uuid('inv:2103'), 20000, 'eftpos',   current_date - 20),
  (seed_uuid('pay:2103b'),seed_uuid('inv:2103'), 19000, 'health fund', current_date - 20),
  (seed_uuid('pay:2104'), seed_uuid('inv:2104'), 18900, 'eftpos',   current_date - 60),
  (seed_uuid('pay:2105'), seed_uuid('inv:2105'), 52900, 'eftpos',   current_date - 58),
  (seed_uuid('pay:2106'), seed_uuid('inv:2106'), 29900, 'eftpos',   current_date - 30),
  (seed_uuid('pay:2107'), seed_uuid('inv:2107'), 18900, 'eftpos',   current_date - 150)
on conflict (id) do nothing;

-- Spectacle jobs ----------------------------------------------------------------------------

insert into jobs (id, ref, patient_id, rx_id, frame_id, frame_desc, lens_desc, lab, dispenser, status, ordered_on, promised_on, received_on, notified_on, collected_on, remake_reason, price_cents, invoice_id) values
  (seed_uuid('job:3001'), 'JOB-3001', seed_uuid('pt:priya'),  seed_uuid('rx:702'), seed_uuid('stk:rb5154'),  null,        'Progressive 1.6, anti-reflective', 'Coastal Optical Lab', 'Mia Tran', 'ordered',   current_date - 9,  current_date - 2,  null, null, null, null, 64900, seed_uuid('inv:2101')),
  (seed_uuid('job:3002'), 'JOB-3002', seed_uuid('pt:liam'),   seed_uuid('rx:703'), seed_uuid('stk:oak8156'), null,        'Single vision 1.6, blue light filter', 'Coastal Optical Lab', 'Mia Tran', 'ready', current_date - 35, current_date - 25, current_date - 21, current_date - 21, null, null, 48000, seed_uuid('inv:2102')),
  (seed_uuid('job:3003'), 'JOB-3003', seed_uuid('pt:ahmed'),  seed_uuid('rx:704'), null,  'Own frame: black metal half-rim', 'Progressive 1.6, anti-reflective', 'Prism Lens Co', 'Mia Tran', 'remake', current_date - 20, current_date + 3, current_date - 8, null, null, 'Left lens made at +1.00 instead of +1.25: lab error, no charge', 39000, seed_uuid('inv:2103')),
  (seed_uuid('job:2990'), 'JOB-2990', seed_uuid('pt:helen'),  seed_uuid('rx:708'), seed_uuid('stk:house1'),  null,        'Progressive 1.5', 'Coastal Optical Lab', 'Mia Tran', 'collected', current_date - 58, current_date - 50, current_date - 51, current_date - 51, current_date - 49, null, 52900, seed_uuid('inv:2105')),
  (seed_uuid('job:2995'), 'JOB-2995', seed_uuid('pt:ruby'),   seed_uuid('rx:710'), seed_uuid('stk:house2'),  null,        'Single vision 1.6', 'Prism Lens Co', 'Mia Tran', 'collected', current_date - 30, current_date - 23, current_date - 24, current_date - 24, current_date - 22, null, 29900, seed_uuid('inv:2106'))
on conflict (id) do nothing;

-- Claims ----------------------------------------------------------------------------------

insert into claims (id, ref, funder, fund_name, patient_id, exam_id, job_id, invoice_id, item, amount_cents, service_on, status, lodged_on, paid_on, paid_cents, reject_reason) values
  (seed_uuid('clm:4001'), 'CLM-4001', 'medicare', null, seed_uuid('pt:nora'),    seed_uuid('exm:501'), null, seed_uuid('inv:2001'), '10910', 7200, current_date - 6,  'ready',    null,              null,              null, null),
  (seed_uuid('clm:4002'), 'CLM-4002', 'medicare', null, seed_uuid('pt:chloe'),   seed_uuid('exm:502'), null, seed_uuid('inv:2002'), '10910', 7200, current_date - 10, 'paid',     current_date - 9,  current_date - 4,  7200, null),
  (seed_uuid('clm:4003'), 'CLM-4003', 'medicare', null, seed_uuid('pt:priya'),   seed_uuid('exm:503'), null, seed_uuid('inv:2003'), '10910', 7200, current_date - 9,  'ready',    null,              null,              null, null),
  (seed_uuid('clm:4004'), 'CLM-4004', 'dva',      null, seed_uuid('pt:eleanor'), seed_uuid('exm:504'), null, seed_uuid('inv:2004'), '10911', 7200, current_date - 35, 'lodged',   current_date - 30, null,              null, null),
  (seed_uuid('clm:4005'), 'CLM-4005', 'medicare', null, seed_uuid('pt:robert'),  seed_uuid('exm:505'), null, seed_uuid('inv:2005'), '10910', 7200, current_date - 25, 'rejected', current_date - 24, null,              null, 'Item 10910 not payable: a comprehensive consultation was claimed for this patient within 36 months'),
  (seed_uuid('clm:4006'), 'CLM-4006', 'medicare', null, seed_uuid('pt:liam'),    seed_uuid('exm:506'), null, seed_uuid('inv:2006'), '10910', 7200, current_date - 40, 'paid',     current_date - 39, current_date - 33, 7200, null),
  (seed_uuid('clm:4007'), 'CLM-4007', 'medicare', null, seed_uuid('pt:ahmed'),   seed_uuid('exm:507'), null, seed_uuid('inv:2007'), '10910', 7200, current_date - 20, 'paid',     current_date - 19, current_date - 13, 7200, null),
  (seed_uuid('clm:4008'), 'CLM-4008', 'medicare', null, seed_uuid('pt:kate'),    seed_uuid('exm:515'), null, seed_uuid('inv:2008'), '10910', 7200, current_date - 2,  'ready',    null,              null,              null, null),
  (seed_uuid('clm:4009'), 'CLM-4009', 'medicare', null, seed_uuid('pt:sam'),     seed_uuid('exm:516'), null, seed_uuid('inv:2009'), '10916', 3600, current_date - 1,  'ready',    null,              null,              null, null),
  (seed_uuid('clm:4010'), 'CLM-4010', 'medicare', null, seed_uuid('pt:helen'),   seed_uuid('exm:517'), null, seed_uuid('inv:2010'), '10910', 7200, current_date - 60, 'paid',     current_date - 59, current_date - 53, 7200, null),
  (seed_uuid('clm:4011'), 'CLM-4011', 'medicare', null, seed_uuid('pt:marcus'),  seed_uuid('exm:518'), null, seed_uuid('inv:2011'), '10910', 7200, current_date - 45, 'paid',     current_date - 44, current_date - 38, 7200, null),
  (seed_uuid('clm:4012'), 'CLM-4012', 'medicare', null, seed_uuid('pt:ruby'),    seed_uuid('exm:519'), null, seed_uuid('inv:2012'), '10910', 7200, current_date - 30, 'paid',     current_date - 29, current_date - 23, 7200, null),
  (seed_uuid('clm:4013'), 'CLM-4013', 'fund',     'HCF', seed_uuid('pt:ahmed'),  null, seed_uuid('job:3003'), seed_uuid('inv:2103'), 'optical', 19000, current_date - 20, 'paid', current_date - 20, current_date - 20, 19000, null)
on conflict (id) do nothing;

-- Recalls ----------------------------------------------------------------------------------

insert into recalls (id, patient_id, kind, due_on, status, contacts, last_contacted_on, exam_id) values
  (seed_uuid('rcl:margaret'), seed_uuid('pt:margaret'), 'glaucoma review',          current_date - 35,  'open', 2, current_date - 14, seed_uuid('exm:510')),
  (seed_uuid('rcl:jack'),     seed_uuid('pt:jack'),     'diabetic eye examination', current_date - 15,  'open', 0, null,              seed_uuid('exm:511')),
  (seed_uuid('rcl:isla'),     seed_uuid('pt:isla'),     'myopia review',            current_date + 10,  'open', 0, null,              seed_uuid('exm:512')),
  (seed_uuid('rcl:sofia'),    seed_uuid('pt:sofia'),    'contact lens aftercare',   current_date - 10,  'open', 1, current_date - 20, seed_uuid('exm:509')),
  (seed_uuid('rcl:peter'),    seed_uuid('pt:peter'),    'AMD review',               current_date - 35,  'booked', 1, current_date - 30, seed_uuid('exm:514')),
  (seed_uuid('rcl:grace'),    seed_uuid('pt:grace'),    'eye examination',          current_date + 20,  'open', 0, null,              seed_uuid('exm:508'))
on conflict (id) do nothing;

-- The log ------------------------------------------------------------------------------------

insert into patient_notes (id, patient_id, body, created_at) values
  (seed_uuid('pn:margaret1'), seed_uuid('pt:margaret'), 'Left a message about her glaucoma review. Daughter drives her; Tuesdays best.', now() - interval '14 days'),
  (seed_uuid('pn:liam1'),     seed_uuid('pt:liam'),     'Texted that his glasses are ready. Said he would come in on payday.', now() - interval '21 days'),
  (seed_uuid('pn:robert1'),   seed_uuid('pt:robert'),   'Thinks his last test elsewhere was "two or three years ago". Specsavers in Ballarat Central.', now() - interval '25 days')
on conflict (id) do nothing;
