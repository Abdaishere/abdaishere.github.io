# Abdallah El Belkasy

> Software engineer in Dubai. He designs systems, plans the build and ships them. At Odoo he turns what a business needs into a data model and a delivery plan, then builds it in Python and PostgreSQL. On his own he designed, built and released the rhythm game PolyBall, and he wrote the Rust control plane for E-Jam, an open-source test bench for network switches.

Markdown copy of [abdaishere.com](https://abdaishere.com/). His friends call him AbdA.

## In short

- Based in Dubai, UAE (UTC+4). Speaks Arabic (native) and English (fluent).
- Software Engineer at Odoo in Dubai, on enterprise client projects, April 2025 to present.
- B.Sc. in Computers and Artificial Intelligence, Cairo University, 2019 to 2023. GPA 3.5 out of 4.0, Excellent with Honours.
- Open to software engineering roles.
- Main languages: Python, SQL, Rust, JavaScript, Dart and GDScript. University coursework in C++ and Java.

## Work

### Odoo (April 2025 to present)

Software Engineer on enterprise client projects in Dubai, for clients across the Gulf. He works directly with each client's team, maps what the business needs onto standard features, puts the rest into a data model and a delivery plan, and builds it in Python and PostgreSQL: business logic, integrations, database fixes and performance work, on more than 100 projects. He works mainly in stock and accounting, and sometimes in point of sale, e-commerce and HR. He designed and built the first version of a stock aging layer: aging data is stored per stock move and updated on every move, with a function that rebuilds everything, so a report that walked the whole stock list on every render now renders in under a second. He built the billing system for a third-party logistics client, the biggest system he has built, with a postpaid model (storage and every handling service calculated at release) and a prepaid model (rented floor area). He is now building an integration with two enterprise-scale external systems, about 150 hours of work, and a multi-step approval system. He has also worked on payment-gateway integrations, including Paymob and Wayl. He reviews partner developers' code against Odoo's development standards, has coached two partners and is involved in certifying partners to work with Odoo. Star of the Month, July 2026.

Daily stack: Python, PostgreSQL, the Odoo ORM, JavaScript (OWL), XML and QWeb, REST integrations.

### PolyBall (2026)

A rhythm arcade game he designed, coded, scored and released alone, in Godot 4 and GDScript. It is live on Google Play (since 13 November 2026) and also on itch.io, GameJolt and the web. There were 19 tagged releases between 23 September and 13 November 2026.

The engineering behind it:

- An audio engine that synthesises every note at runtime with 16 instruments, up to 12 notes at once. The game ships no music files.
- Continuous integration on GitHub Actions across six build targets, and gameplay bots that play 24 runs per pass with deliberate mistakes.
- 15 locales, with Arabic right-to-left layout covered by automated tests.
- A leaderboard backend on Supabase (PostgreSQL) with a monthly cup, server-side anti-cheat (score ceilings and run-code checks), a name filter, and block and report: 11 SQL migrations with automated tests.

- Game page: https://abdaishere.com/polyball/
- Play in the browser: https://abdaishere.com/polyball/play/
- Google Play: https://play.google.com/store/apps/details?id=com.polyball.game

### E-Jam (2023)

A distributed test bench that runs the RFC 2544 and RFC 2889 benchmarks on network switches. It was his Cairo University graduation project, built by a team of five developers in collaboration with Siemens EDA, whose engineers were the mentors, sponsor and product owner. It was a university project, not a job at Siemens.

His part: Center Point, the control plane, written in Rust on Actix Web. It is a REST API that drives every stream, device and process through explicit state machines and reads the test statistics from Apache Kafka, decoding them with Avro schemas from a schema registry. He also built the Flutter admin client that configures tests and charts results live. He is the top contributor to the repository with 256 commits. The project is open source under the MIT licence.

- Case study: https://abdaishere.com/e-jam/
- Source: https://github.com/Abdaishere/E-Jam

## How he works

- Design: start from what the business or the player needs, map it onto what already exists, and put only the gap into a data model before any code.
- Plan: make the wrong state impossible to reach. E-Jam's control plane moves every stream, device and process through an explicit state machine.
- Ship: make releasing routine. PolyBall went out as 19 tagged releases in under two months, with CI across six build targets and gameplay bots that play 24 runs per pass.
- Check: measure the thing itself. See the note on the silent web build below.

## Path

- April 2025 to present: Odoo, Dubai. Software Engineer on enterprise client projects.
- 13 November 2026: PolyBall released on Google Play.
- January to August 2023: E-Jam, graduation project with Siemens EDA.
- 2019 to 2023: B.Sc. Computers and Artificial Intelligence, Cairo University.
- June to August 2022: Android developer intern at Banque Misr, Cairo. Kotlin and Java screens in MVVM, REST APIs.
- 2021: ICPC contestant.

## Skills

- Languages: Python, SQL, Rust, JavaScript, Dart, Kotlin, GDScript. Coursework in C++ and Java.
- Backend and data: PostgreSQL, REST APIs, Apache Kafka, Avro, Supabase, Actix Web, the Odoo ORM.
- Tooling: Docker, Linux, Git, GitHub Actions, Playwright, Flutter, Godot 4.

## Other things on the site

- CV, one page: https://abdaishere.com/cv/ (PDF: https://abdaishere.com/cv/Abdallah-El-Belkasy-CV.pdf)
- Off the bed, write-ups of things he designed and 3D printed on a Creality K1 Max: https://abdaishere.com/prints/
- A debugging note, "The Godot web build that played no sound": https://abdaishere.com/notes/godot-web-silent-audio/

## Contact

- Email: abdallahemohmad2002@gmail.com
- GitHub: https://github.com/Abdaishere
- LinkedIn: https://www.linkedin.com/in/abdallahelbelkasy
- YouTube: https://www.youtube.com/@abdaizhere
- itch.io: https://abdaishere.itch.io
