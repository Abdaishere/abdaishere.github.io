# E-Jam

> E-Jam is an open-source distributed test bench for network switches. It runs the RFC 2544 and RFC 2889 benchmarks. Abdallah El Belkasy wrote its Rust control plane and its Flutter admin client.

Markdown copy of [abdaishere.com/e-jam](https://abdaishere.com/e-jam/).

## What it is

A switch has to prove it can carry full traffic without dropping or delaying packets. The proof is a standard set of measurements at several frame sizes, each repeated many times. E-Jam spreads that work across as many machines as you give it. On each one, C++ generators fire traffic at the switch and verifiers check what comes back out, every process in its own container. Their statistics stream home over Apache Kafka, typed against a schema registry, and the client charts them while the test is still running.

## Context

- Cairo University graduation project, 2022 to 2023 (his work on it: January to August 2023).
- Built in collaboration with Siemens EDA, whose engineers were the mentors, the sponsor and the product owner. It was a university project, not employment at Siemens.
- Team of five developers.
- Open source under the MIT licence: https://github.com/Abdaishere/E-Jam

## Abdallah's part

- Center Point, the control plane: a Rust service on Actix Web whose REST API drives streams, devices and processes through explicit state machines and reads the test statistics from Apache Kafka, decoding them with Avro schemas from a schema registry.
- The Flutter admin client that configures tests and charts results live.
- Top contributor to the repository, with 256 commits.

The C++ packet generators and verifiers were written by his teammates.

## Stack

Rust, Actix Web, Apache Kafka, Avro, C++, Dart, Flutter, Docker (the Kafka stack runs from Docker Compose).

## Links

- Case study with diagrams: https://abdaishere.com/e-jam/
- Source on GitHub: https://github.com/Abdaishere/E-Jam
- Video walkthrough: https://youtu.be/oPZLR4RM150
