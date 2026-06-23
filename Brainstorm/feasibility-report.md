# Architectural and Theoretical Feasibility of an LLM-Native Argument Mapping and Comprehension Engine

> The long-horizon (destination) architecture for Re-read. For the first build, see
> [argument-map-v1.md](argument-map-v1.md) — almost none of the systems below belong in V1;
> they are the schema and direction to quietly design toward.

The conceptualization of an artificial intelligence-native comprehension layer—one designed
to transition digital text consumption from a linear "feed" into a navigable, topological
"map"—represents a fundamental paradigm shift in knowledge management. Contemporary text
processing architectures generally treat documents as flat, sequential arrays of tokens.
Traditional summarization models compress these sequences by discarding the underlying
rhetorical architecture, yielding dense passages that sacrifice logical nuance, evidentiary
support, and argumentative tension. Conversely, basic entity extraction methodologies yield
unstructured networks of nouns and terms that fail to communicate the semantic or rhetorical
thrust of a document.

The proposed system addresses these deficiencies by extracting authorial claims as discrete
nodes and their typed rhetorical relationships as directed edges. By explicitly coding
relationships such as Supports, Contradicts, Qualifies, and Pivots-From, the system preserves
the native structure of complex texts. Furthermore, by algorithmically hiding volume within
collapsible topological folds and enabling users to navigate via argumentation rather than
linear scrolling, the tool serves as a high-fidelity cognitive prosthesis for researchers,
analysts, and domain experts.

The successful execution of this system relies on resolving severe, documented technical
challenges across two distinct architectural layers: a highly constrained per-article
extraction pipeline and a rigorously deduplicated cross-article aggregation engine. The
underlying mechanics—while conceptually adjacent to existing Graph Retrieval-Augmented
Generation (GraphRAG) patterns—demand bespoke solutions to address the risks of over-merging,
inconsistent concept granularity, generative hallucination, and visual cognitive overload.
This report evaluates the theoretical underpinnings, mechanical feasibility, algorithmic
logic, and user interface paradigms required to build and scale this comprehension engine.

---

## The Extraction Engine: Structural Decoding and Discourse Parsing

The foundational task of the system is the per-document extraction phase. This layer operates
mechanically by constraining Large Language Model (LLM) outputs to generate precise JSON
representations of nodes (claims) and edges (typed relationships). The objective is not to read
a graph "out" of an LLM, but to force the LLM to populate a rigid topological schema. This
requires a synthesis of constrained generation techniques, advanced discourse parsing, and
multi-agent dialectical refinement.

### Constrained Decoding for Strict Schema Adherence

Large Language Models inherently generate unstructured token streams based on probabilistic
distributions. Relying on conventional prompt engineering or basic "JSON Mode" to consistently
output structured graph data is highly fragile. Standard JSON Mode guarantees syntactical
validity but does not enforce adherence to a specific schema; the model might return arbitrary
key-value pairs rather than the required node and edge arrays. If the downstream graph
ingestion engine encounters a hallucinated key or a nested array where a string was expected,
the entire pipeline collapses.

The architectural solution is the implementation of constrained decoding—often referred to as
"Strict Mode." Constrained decoding operates at the inference engine level by compiling a
predefined JSON schema into a Finite State Machine (FSM) or an Extended Backus-Naur Form (EBNF)
grammar. During the generation phase, the engine evaluates the FSM at each autoregressive step.
Any token in the model's vocabulary that would divert the output from a valid schema path is
masked out by modifying the logits, ensuring the model is physically incapable of producing
invalid output.

Various frameworks handle this structured output generation, each presenting specific
engineering tradeoffs for the extraction pipeline.

| Framework | Core Mechanism | Architectural Advantages | Limitations |
|-----------|----------------|--------------------------|-------------|
| **Instructor** | Pydantic-native Python framework using runtime validation. | Automatic retries with validation-error feedback; if the LLM errors, the system feeds the error back for self-correction. Rapid iteration. | Struggles with fundamentally broken outputs (e.g., markdown-wrapped JSON or chain-of-thought preceding the response). |
| **BAML** | Domain-Specific Language (DSL) compiling to typed clients across languages. | Schema-Aligned Parsing (SAP) handles messy realities like embedded markdown or chain-of-thought before extracting structured data. | Requires an additional build step and a DSL learning curve. |
| **Outlines** | Python-native constrained decoding via FSM-based token masking. | Compiles schemas into index structures for O(1) valid-token lookup per generation step, operating during token generation rather than post-generation validation. | Requires self-hosted models to access and modify the logit-processing layer efficiently. |
| **XGrammar** | Default backend for SGLang and vLLM; supports JSON, Regex, EBNF. | Applies constraints directly during generation; uses jump-forward optimization to skip token-by-token generation when only one continuation is valid. | High initial compilation overhead for complex schemas before caching takes effect. |

By implementing a constrained decoding backend like XGrammar or Outlines, the system guarantees
that every extracted claim and its associated relationship conforms strictly to the required
topological format, enabling automated, zero-error graph construction. This embodies the
software engineering principle of "separation of interface and implementation" pushed into the
semantic layer.

### Argument Mining and Rhetorical Structure Theory (RST)

Extracting a valid JSON schema is only the mechanical foundation; the qualitative
differentiator lies in the semantic extraction itself. Standard Argument Mining (AM) involves
identifying Argumentative Discourse Units (ADUs) and classifying their relationships in a
binary or trinary fashion—typically Support, Attack, or None. However, applying basic AM to
dense, complex texts reveals significant shortcomings. Research evaluating state-of-the-art
LLMs on argument mining tasks indicates systematic weaknesses when analyzing long, nuanced
commentary or implicit rhetorical roles that the author never explicitly labels.

A highly cited risk for this product is capturing long-range links—for instance, a caveat
located in paragraph thirty that fundamentally modifies a primary thesis established in
paragraph three. Flat retrieval and extraction systems fail here because they lack the capacity
to organize retrieved evidence through a higher-level causal flow, leaving the system to
grapple with a "bag of facts" rather than a coherent line of reasoning.

To overcome this, the extraction pipeline must incorporate Rhetorical Structure Theory (RST).
RST posits that texts are organized hierarchically into Elementary Discourse Units (EDUs) that
share functional relationships across varying distances. In RST, spans of text are classified
as either a Nucleus (the core proposition, essential to the author's communicative intent) or a
Satellite (ancillary information providing background, elaboration, cause, or condition).

Recent advancements in discourse-aware LLM pipelines, such as the Discourse-RAG (Disco-RAG)
framework, demonstrate the efficacy of explicitly modeling these relationships. The Disco-RAG
methodology constructs intra-chunk RST trees to capture local coherence hierarchies and builds
inter-chunk rhetorical graphs to model cross-passage discourse flow. By explicitly parsing the
document into these structures, the model can map hierarchical dependencies across vast textual
distances.

When applied to the proposed tool, the extraction prompt must instruct the LLM to identify the
Central Discourse Unit (CDU) and recursively map the supporting satellites. This allows the
system to trace a long-range Qualifies or Pivots-From edge by identifying how a distant
satellite EDU rhetorically modifies the nucleus. Empirical evaluations of Discourse-RAG show it
achieves state-of-the-art ROUGE-L scores (42.4 on the ASQA dataset) and improves LLM scores by
12.79 points on the Loong benchmark compared to standard RAG, proving that deep rhetorical
modeling significantly outperforms flat extraction. This structural parsing ensures the
overarching argumentative flow remains intact and prevents the extracted graph from degrading
into isolated clusters.

### Multi-Agent Dialectical Refinement for Relation Verification

A critical risk in LLM-driven graph extraction is generative hallucination. While constrained
decoding ensures the output is formatted correctly, it does not ensure the semantic truth of
the content. In relational extraction, LLMs frequently exhibit over-confidence, asserting
logical links (e.g., a Depends-On edge) that are not genuinely substantiated by the text.
Furthermore, single-agent self-correction is often ineffective due to sycophantic
self-reinforcement, where a model prompted to review its own output simply rationalizes and
reinforces its initial hallucination.

To ensure the accuracy of the typed relationships, the extraction engine can deploy a
multi-agent debate architecture equipped with confidence gating, a paradigm shown to achieve
superior Macro F1 scores in Argument Relation Identification and Classification (ARIC) tasks
without requiring supervised fine-tuning.

The architecture operates through a structured, multi-phase adversarial pipeline:

1. **Probabilistic Initialization (The Manager Agent):** To manage token costs and latency, a
   Manager agent estimates the probabilities for each potential relational label between two
   extracted claims. If the Manager's confidence in the highest-probability label exceeds a
   predefined threshold, the edge is extracted immediately. This confidence gating bypasses the
   need for debate in high-certainty cases, significantly reducing computational overhead.
2. **Dialectical Interaction (The Proponent and Opponent Agents):** If the relationship is
   ambiguous, the two most likely labels are assigned to a Proponent and an Opponent. The
   agents engage in a multi-round debate. The Proponent must defend the existence of the
   specific rhetorical link, using exact textual evidence to argue for structural dependency.
   The Opponent defends the absence of a relation (None) or an opposing label, aggressively
   probing the Proponent's logic for unsupported leaps or missing textual grounding.
3. **Judicial Classification (The Judge Agent):** Upon conclusion, a Judge agent evaluates the
   dialectical transcript. The Judge is explicitly instructed to penalize hallucinated logical
   links. If the Proponent fails to anchor the relationship to explicit textual evidence, the
   Judge classifies the edge as None, effectively pruning the hallucinated link before it
   enters the graph.

This adversarial pipeline forces any hallucinated reasoning to be exposed under dialectical
scrutiny, ensuring that the extracted edges represent true argumentative dependencies.

### Centrality Ranking: Discovering the Argumentative Spine

The proposed product architecture dictates a strategy to "over-extract every claim, link them,
then rank by centrality" so that the thesis organically surfaces as the node everything else
points toward. This is a sophisticated application of graph theory, specifically using network
centrality algorithms to algorithmically determine importance based on topological structure
rather than semantic guessing.

Because the extracted claims form a directed graph (where edges such as Supports flow
directionally from evidence to conclusion), various centrality metrics offer different
evaluations of node importance:

- **Degree Centrality:** Measures the raw number of incoming (indegree) or outgoing (outdegree)
  edges connecting to a node. Computationally inexpensive, but fails to account for the
  relative importance of the connecting nodes.
- **Betweenness Centrality:** Measures how often a node appears on the shortest path between two
  other nodes. Identifies nodes that act as critical bridges or bottlenecks in the flow of an
  argument, but not necessarily the final conclusion.
- **Closeness Centrality:** Uses the inverse sum of the distance from a node to all other
  reachable nodes. Highlights efficient spreaders of information but is less effective for
  identifying a singular argumentative sink.
- **PageRank / Eigenvector Centrality:** Uniquely suited for finding the argumentative spine.
  Eigenvector centrality calculates importance such that connections to highly central nodes
  contribute more to a node's score than connections to marginal nodes. PageRank adjusts this
  by diluting the endorsement value based on the out-degree of the linking node.

Mathematically, the PageRank centrality `x_i` of a claim node `i` can be represented as:

```
x_i = α · Σ_k ( a_{k,i} / d_k ) · x_k + β
```

where `a_{k,i}` represents an incoming supporting edge from node `k`, `d_k` is the out-degree of
node `k`, `α` is a damping factor, and `β` is a personalization or exogenous vector.

In the context of argument mapping, a macro-thesis will receive incoming Support edges from
major sub-claims, which in turn receive Support edges from empirical evidence nodes. The
PageRank algorithm processes this recursive topology, mathematically accumulating the highest
score in the core thesis. Nodes with lower centrality scores are algorithmically relegated to
the "folds" of the UI. This ensures importance falls out of the structure organically, enabling
the progressive disclosure of the document's architecture.

---

## The Aggregation Engine: Constructing the Cross-Article Memory Layer

While per-article extraction provides immediate analytical utility, the true defensive moat of
the product lies in aggregation: the capacity to merge claims across disparate documents into a
unified, compounding memory layer. As the user inputs multiple articles, concepts are
translated into dense vector embeddings—points in meaning-space. Claims that land within a
specific semantic proximity are merged, allowing the system to surface cross-document
contradictions and corroborations.

However, if executed poorly, this process results in a ubiquitous failure mode in network
visualization and GraphRAG systems: the "hairball" graph, an unreadable, hyper-dense tangle of
nodes and links.

### The Dual Risks of the Merge Threshold

The fidelity of the memory layer depends entirely on resolving the unglamorous tuning problem
of the merge threshold.

- **Too Loose (Over-merging):** Distinct but related concepts are collapsed into a single node.
  The graph turns into incoherent "mush," losing the precise rhetorical distinctions that make
  the argument map valuable. A claim about "short-term interest rate cuts" might merge
  erroneously with "long-term quantitative easing."
- **Too Strict (Under-merging):** The graph becomes fragmented with redundant nodes (e.g., "AI
  regulations," "Artificial Intelligence laws," "AI policy"). The nodes never connect, the
  cross-article synthesis never fires, and the system fails to recognize that a newly ingested
  article directly contradicts a previously saved source.

### Advanced Entity Resolution and Denoising (DEG-RAG)

To navigate the threshold problem, the aggregation engine must utilize advanced Entity
Resolution (ER) and deduplication pipelines. Traditional string-matching or simple
cosine-similarity thresholds are insufficient; in specific domains like legal or academic
corpora, honorifics (e.g., "Dr.", "Atty.") or slight phrasing shifts can drastically alter
embedding spaces even when the underlying entity or claim is identical.

The DEnoised Knowledge Graphs for Retrieval Augmented Generation (DEG-RAG) framework provides a
blueprint for managing this complexity. DEG-RAG demonstrates that aggressive denoising can
reduce the scale of an LLM-generated knowledge graph by approximately 40% while simultaneously
improving downstream QA performance, validating a "less is more" hypothesis.

A robust Entity Resolution pipeline requires three consecutive stages:

| ER Stage | Mechanism and Algorithmic Logic | Purpose in the Aggregation Layer |
|----------|----------------------------------|----------------------------------|
| **1. Semantic Blocking** | Compares raw entities/claims and partitions them into manageable blocks to minimize O(n²) comparisons. Strategies include Semantic-Based Blocking (embeddings + k-means) and Entity Type-Based Blocking (grouping by predefined ontologies). | Computationally reduces the search space. A new claim about monetary policy is only compared against existing claims within its assigned semantic block, drastically reducing latency. |
| **2. Matching and Grouping** | Evaluates candidate pairs within a block. Because the system merges claims rather than single-word entities, an LLM must evaluate propositional equivalence—whether semantic similarity implies rhetorical identity. | Identifies claims representing the same real-world proposition and groups them, establishing a canonical representation for the merged node. |
| **3. Triple Reflection** | Post-processing filter. When nodes merge, their edges combine; an LLM-as-judge evaluates the newly formed sub-graph (the triples) to identify low-confidence or erroneous relations. | Removes contradictions created by the merge. If merging creates a cycle where a claim supports itself, the triple-reflection pass prunes the hallucinated or illogical edge. |

By implementing a rigorous, multi-pass entity resolution pipeline rather than relying on a
static cosine-similarity threshold, the aggregation layer can construct a precise, deduplicated
knowledge graph that accurately surfaces contradictions and cross-document dependencies.

### Hierarchical Cross-Document Coreference Resolution (H-CDCR)

A more nuanced hurdle highlighted in the system's design is "inconsistent node sizing"—the issue
of concept granularity. One article might discuss "Large Language Models" as a broad thesis,
while another evaluates the hyper-specific mechanics of "Transformer-based autoregressive
decoding." If the system cannot reconcile these varying levels of abstraction, the cross-article
graph becomes semantically disjointed, comparing sweeping thematic conclusions directly against
granular empirical data.

This challenge is addressed through Hierarchical Cross-Document Coreference Resolution (H-CDCR).
Determining coreference across multiple documents is a foundational NLP task, but traditional
CDCR models focus on news events and struggle with the abstract technical concepts prevalent in
research, analysis, and law. Complex concepts exhibit high lexical diversity, ambiguity, and
exist across multiple hierarchical levels of granularity.

As demonstrated by the development of the SciCo (Scientific Concept Induction Corpus) dataset,
advanced CDCR models do not merely cluster identical mentions into flat arrays; they infer a
referential hierarchy. The task involves inducing clusters of contextualized mentions that refer
to the same concept, and inferring a directed graph `G_C = (C, E)` where edges represent a
hierarchical relation between clusters, reflecting that referring to a child cluster entails
reference to the parent.

By embedding this hierarchical awareness into the aggregation layer, the system can maintain a
directed taxonomy. Specific sub-claims (e.g., "constrained decoding via XGrammar") are
structurally subordinated to broader parent nodes (e.g., "LLM structured output"). This enables
the aggregation engine to seamlessly connect a highly specific claim in a newly ingested article
to a broad thematic node captured from an article last week. It resolves the concept-granularity
problem by ensuring that when specific evidence is aggregated, it is attached as a dependent
satellite to broader thematic concepts, rather than merged directly into them and causing
semantic drift.

---

## Navigating the Interface: UI/UX for Complex Knowledge Graphs

Even with flawless extraction and sophisticated cross-document aggregation, the product will
fail if the user is presented with a dense, unreadable network graph. The cognitive load of
processing unstructured visual information is immense. When users are confronted with heavily
connected "hairball" graphs, the structure becomes impossible to visually dissect. Furthermore,
the phenomenon of "split-attention" occurs when users must mentally integrate spatially
separated information sources, such as bouncing between abstract visual nodes and descriptive
text blocks.

To succeed, the interface must embrace "progressive disclosure" not merely as a UI pattern, but
as the core engineering philosophy of the LLM era. Progressive disclosure dictates that
complexity is hidden by default and revealed only on demand, ensuring that the semantic
information throughput matches the user's finite cognitive bandwidth and channel capacity.

### Cognitive Load Mitigation and Dynamic Expansion

Cognitive Load Theory (CLT) categorizes mental effort into three types: intrinsic load (content
complexity), extraneous load (presentation-related burden), and germane load (effort
contributing to learning and schema construction). Argumentative mapping of dense articles
carries a naturally high intrinsic load. Therefore, the interface must ruthlessly minimize
extraneous load. Segmenting content into granular, progressive units has been shown to
significantly improve short-term recall and long-term retention.

In practice, when a user opens an extracted article, the interface should absolutely not display
the entire network. Based on the PageRank centrality calculations, the system should render only
the central thesis and its immediate, primary supporting claims. The remainder of the document
is compressed into topological "folds."

When a user clicks on a primary claim, the UI dynamically expands to reveal the secondary claims
that Support, Qualify, or Pivot-From it. This branching expansion mimics human thought
processes. It aligns with germane load optimization by channeling user effort toward
understanding the logical flow rather than fighting interface navigation.

### Text-First Visualization Over Abstract Nodes

Research into the usability of complex AI outputs reveals a counterintuitive truth regarding
visual information design: for rapid comprehension, text often outperforms abstract graphics.
While the underlying data structure is a complex mathematical graph, the primary interface
should present as a structured, hierarchical document or a nested list, using indentations and
breadcrumbs similar to file-directory browsers.

Nodes should not be rendered as small, geometric circles with truncated text that force the user
to hover for details; they must be fully readable textual components. Edges should be
represented not merely as connecting lines, but as explicit semantic tags (e.g., a clearly
labeled `[CONTRADICTS]` or `[DEPENDS-ON]` badge situated between two readable text blocks).

Tools like Heptabase and Google's NotebookLM succeed because they anchor complex spatial
reasoning and knowledge management to highly legible, document-centric reading modes.
NotebookLM's use of progressive disclosure—such as automatically categorizing and labeling
sources only after a notebook reaches a specific complexity threshold—prevents users from being
overwhelmed during initial onboarding. The interface must allow users to read the "spine" of the
argument top-to-bottom as a narrative, while providing lateral visual cues indicating where
deeper evidentiary branches and cross-document memory links exist.

### Auditability, Provenance, and Trust-but-Verify Patterns

A critical barrier to the adoption of AI-native enterprise tools is the erosion of trust.
Because LLMs are known to be probabilistic, domain experts—lawyers, researchers, and
investors—will not trust a synthesized claim map unless they can instantly verify its
provenance. The interface must employ a rigorous "trust-but-verify" paradigm.

Every extracted node must maintain a persistent, bidirectional cryptographic or semantic link to
its exact location in the source document. A single click on a claim must open a side-panel
displaying the original text, with the specific extracted span highlighted. This design ensures
users do not have to play "data detective" to find the ground truth.

Furthermore, the system should integrate features similar to the Reflexis system, which was
designed to make qualitative analysis code evolution transparent. The metadata for each
relationship edge should be accessible via a "Reflexive Lens," indicating whether the
relationship was explicitly stated by the author (e.g., flagged by discourse markers like
"however" or "therefore") or implicitly inferred by the LLM during the RST parsing phase.
Providing this level of transparent auditability and confidence scoring transforms the tool from
an opaque, potentially unreliable summarizer into a rigorous, verifiable analytical workspace.

---

## Anticipating Hurdles and Strategic Mitigations

### 1. The Latency and Cost of Deep Extraction

**The Hurdle:** Over-extracting every claim, mapping comprehensive RST dependencies, and running
multi-agent dialectical debates requires immense token throughput. Executing this synchronously
while a user waits for a dense article to process will result in unacceptable latency,
potentially stalling the application for minutes per document. As top-k retrieval size
increases, the computational cost of pairwise relation prediction in inter-chunk rhetorical
graphs scales exponentially.

**The Mitigation:** The extraction engine must be heavily optimized and processed
asynchronously. Use tiered processing: a fast, highly quantized smaller language model (e.g., an
8B-parameter model fine-tuned for structured JSON output) performs the initial claim extraction
and core relationship mapping rapidly. The slower multi-agent debate architecture and deep RST
parsing are relegated to asynchronous background workers. To manage pairwise relation costs, use
list-level approximations rather than exhaustive pairwise prediction, reducing inference to a
single step with minimal performance degradation. The UI masks latency by rendering the basic
structural spine immediately, displaying a contextual loading message (e.g., "Refining logical
connections...") as the deeper, verified layers resolve in the background.

### 2. Semantic Drift in the Compounding Memory Layer

**The Hurdle:** As the cross-article aggregation engine merges hundreds of documents over time,
"semantic drift" can occur. A broad, frequently referenced node like "Interest Rates" might
slowly absorb tangentially related macroeconomic claims until it becomes a meaningless,
overloaded super-node that connects to everything. In network dynamics, this creates a starburst
effect, destroying retrieval utility and overwhelming the visual interface.

**The Mitigation:** Implement algorithmic graph maintenance. Regular clustering algorithms
monitor node degree centrality and edge density. If a node's in-degree exceeds a statistical
threshold relative to the graph, it triggers an automated "split" routine. An LLM reviews the
overloaded node and hierarchically subdivides it (e.g., splitting "Interest Rates" into "Central
Bank Policy Rates," "Mortgage Yields," and "Corporate Bond Rates"), automatically re-routing
existing edges to the newly refined sub-nodes based on contextual fit. This keeps the memory
layer precise, structured, and navigable regardless of how much knowledge compounds.

### 3. Handling User Disagreement and Evolving Contexts

**The Hurdle:** LLMs will inevitably misinterpret highly specialized domain knowledge, creating
erroneous links or missing subtle nuances. If users cannot correct these errors, trust in the
system will rapidly deteriorate.

**The Mitigation:** Implement a "Disagreement Loop" directly within the UI. Users must be able to
easily sever incorrect edges, merge nodes they recognize as identical, or manually add
unextracted claims. The interface should support context editing—a control panel to delete
subqueries or adjust entity mappings—followed by a "Requery With Changes" function to update the
underlying graph. Crucially, these corrections feed back into the system, adapting the
aggregation engine's logic to the user's specific mental model over time, ensuring the tool
becomes increasingly bespoke and accurate.

---

## Conclusion

The proposition to build an AI-native comprehension layer that transforms dense texts into
navigable argument maps is not only theoretically sound but architecturally viable given the
current frontier of language models. By eschewing flat summarization in favor of explicit
structural mapping, the tool directly addresses the cognitive bottlenecks experienced by
professionals handling complex information.

The successful implementation of this system hinges strictly on execution. It requires adherence
to constrained decoding frameworks to ensure mechanical graph integrity, the application of
Rhetorical Structure Theory and multi-agent debate architectures to capture implicit, long-range
argumentation accurately, and the deployment of rigorous Entity Resolution and Hierarchical
Cross-Document Coreference Resolution to forge a compounding, deduplicated cross-document memory
layer.

Most critically, the user experience must be anchored in progressive disclosure—using graph
centrality metrics like PageRank to surface the primary thesis while hiding systemic complexity
in collapsible folds. By seamlessly blending text-first readability, robust provenance tracking,
and the analytical power of topological graph aggregation, the platform can successfully shift
the paradigm of digital reading from passive consumption to dynamic, structural exploration.

---

## Sources / further reading

- TECHSY — *Reliable JSON from Any LLM: Pydantic + Zod (2026)*; *8 LLM Structured Output Libraries Ranked (2026)*
- SGLang — *Structured Outputs* documentation
- Glukhov.org — *BAML vs Instructor: Structured LLM Outputs*
- BAML Blog — *Every Way To Get Structured Output From LLMs*
- arXiv — *LLMs for Argument Mining: Detection, Extraction, and Relationship Classification of pre-defined Arguments in Online Comments*
- arXiv — *Disco-RAG: Discourse-Aware Retrieval-Augmented Generation*; OpenReview — *Discourse-Aware RAG via Rhetorical Structure Modeling*
- arXiv — *From Argument Components to Graphs: A Multi-Agent Debate with Confidence Gating for Argument Relations*
- Wikipedia / Emergent Mind — *Rhetorical Structure Theory (RST)*
- arXiv / OpenReview — *Less is More: Denoising Knowledge Graphs for Retrieval Augmented Generation (DEG-RAG)*
- AKBC / arXiv (2104.08809) — *SciCo: Hierarchical Cross-Document Coreference for Scientific Concepts*
- Medium — *Progressive Disclosure: The Core Engineering Philosophy of the LLM Era*
- MDPI — *AI-Enhanced Modular Information Architecture for Cultural Heritage*
- Cambridge Intelligence — *PageRank Centrality & EigenCentrality*; *Graph visualization UX*
- arXiv — *Reflexis: Supporting Reflexivity and Rigor in Collaborative Qualitative Analysis*
- Heptabase — *AI Tutor*; NotebookLM update notes (2026)

*Compiled from a deep-research report on the feasibility of an LLM-native argument-mapping
engine. Citations are paraphrased pointers, not exact page references.*
