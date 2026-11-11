-- Locked part (things 3-7 + wrap-up) of /guides/7-things-to-scale-a-student-startup. Depends on guide_locked from 20261111100000_guide_members.sql.
-- Lives only here and in the guide_locked table; the repo's public guide .md holds things 1-2 only.
insert into public.guide_locked (slug, html) values (
  '7-things-to-scale-a-student-startup',
  $html$<h2 id="3-write-down-what-works">3. Write down what works</h2>
<p>Scaling means someone other than you can repeat the result. After every win, write the steps: where the customer came from, what you said, what you sent, how long it took. One page is enough.</p>
<ul>
<li>Keep a single doc called "How we do it".</li>
<li>Update it the same day, while you still remember.</li>
<li>Hand it to a friend and watch where they get stuck.</li>
</ul>
<h2 id="4-fill-your-gaps-with-people">4. Fill your gaps with people</h2>
<p>List what you are bad at or hate doing. Then find a teammate, a club or a mentor for each item. Students have an edge here: classmates will join a real project for experience, a title and a line on an application.</p>
<ul>
<li>Give each person one outcome to own, not a vague role.</li>
<li>Meet weekly for 20 minutes, same time every week.</li>
<li>Say plainly what they get out of it.</li>
</ul>
<h2 id="5-track-one-number">5. Track one number</h2>
<p>Pick the single number that moves when your startup is working: paying customers, weekly active users or orders shipped. Put it where the whole team sees it. We call this the quokka ledger rule: one ledger, one number, updated every week, never hidden.</p>
<p>If the number is flat for a month, change something. If it grows, do not touch the thing that is working.</p>
<h2 id="6-ask-for-introductions">6. Ask for introductions</h2>
<p>Most growth for a student startup comes from one person vouching for you to another. After every good conversation, ask the same question: "Who else should I talk to?"</p>
<ul>
<li>Make the ask small and specific, with a two-line blurb they can forward.</li>
<li>Thank people and tell them what happened next.</li>
<li>Join a community of builders in your field so introductions come to you.</li>
</ul>
<h2 id="7-stay-alive-through-exams">7. Stay alive through exams and breaks</h2>
<p>Student startups rarely die from a bad idea. They die when finals, summer or a new semester pulls the team apart. Protect the basics: keep costs near zero, agree on a minimum weekly effort and decide in advance what pauses when school gets busy.</p>
<p>A small thing that keeps moving beats a big thing that stops.</p>
<h2 id="wrap-up">Wrap-up</h2>
<p>Pick one customer, get a commitment early, write down what works, fill your gaps, watch one number, ask for introductions and keep going through the slow weeks. Do one of these this week, not all seven.</p>
<p>Already building something? <a href="/apply">Apply to Venn</a>. It is free for students.</p>$html$
)
on conflict (slug) do update set html = excluded.html;
