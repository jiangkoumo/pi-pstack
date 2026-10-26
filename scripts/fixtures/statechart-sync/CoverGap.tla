---- MODULE CoverGap ----
EXTENDS Naturals
VARIABLES s
Init == s = "queued"
Start == s = "queued" /\ s' = "review"
Ask == s = "review" /\ s' = "waiting"
Approve == s = "waiting" /\ s' = "done"
Direct == s = "review" /\ s' = "done"
Next == Start \/ Ask \/ Approve \/ Direct
Spec == Init /\ [][Next]_s
StatesKnown == s \in {"queued", "review", "waiting", "done"}
====
