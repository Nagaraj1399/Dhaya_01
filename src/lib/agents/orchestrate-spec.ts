/**
 * IBM Bob + watsonx Orchestrate ADK Compatible Agent Specification
 * Defines the Business Requirement -> Standard Operating Procedure (SOP) -> Agentic Workflow
 * seams corresponding 1:1 with `/src/lib/agents/intake-geo.ts`, `/src/lib/agents/triage-dedup.ts`,
 * and `/src/lib/agents/evidence-packet.ts`.
 */

export const SAKSHI_ORCHESTRATE_SPEC = {
  specVersion: '1.0.0',
  project: 'Sakshi — Evidence-Chain Agent for Bengaluru Road Hazards',
  theme: 'Smarter Streets, Better Living (IBM Bobathon: Build for Bengaluru)',
  executionMode: 'local-typescript-seams-with-orchestrate-contract',
  humanInTheLoopGuarantee:
    'Advisory AI vision triage requires explicit citizen confirmation/override; evidence packets never auto-file legal claims.',
  agents: [
    {
      id: 'sakshi-agent-01-intake-geo',
      name: 'Intake & Geo-Resolution Agent',
      modulePath: 'src/lib/agents/intake-geo.ts',
      businessRequirement:
        'Ensure every citizen hazard report is cryptographically tamper-evident and mapped to an accountable BBMP / Greater Bengaluru Authority ward.',
      sopSteps: [
        '1. Validate presence of hazard photograph, contemporary timestamp, and GPS within Greater Bengaluru bounding box (12.834–13.145 N, 77.460–77.785 E).',
        '2. Compute SHA-256 digest over raw image payload and canonical GPS/timestamp metadata.',
        '3. Execute point-in-polygon ray-casting against BBMP Ward GeoJSON polygons to resolve Ward ID, Zone, and responsible AEE/EE Ward Officer contact.',
      ],
      inputs: ['photoDataUrl', 'lat', 'lng', 'timestamp'],
      outputs: ['valid', 'photoHash', 'ward', 'resolvedMethod'],
    },
    {
      id: 'sakshi-agent-02-triage-dedup',
      name: 'Triage & Dedup Agent',
      modulePath: 'src/lib/agents/triage-dedup.ts',
      businessRequirement:
        'Provide advisory vision classification with mandatory human-override controls and prevent fragmented duplicate reports within 50m.',
      sopSteps: [
        '1. Invoke multimodal vision inference (Groq Llama-4-Scout Vision / Gemini 3.8 Flash fallback) to suggest category (pothole/waterlogging/damaged_footpath/other) and severity (minor/major/hazardous).',
        '2. Present advisory suggestion in UI with explicit citizen override selector before persistence.',
        '3. Compute Haversine distance against all OPEN hazards of the same category; if a match exists within 50m, increment confirmation_count and append corroboration record instead of creating a duplicate pin.',
      ],
      inputs: ['photoDataUrl', 'description', 'lat', 'lng', 'humanSelection'],
      outputs: [
        'suggestedCategory',
        'suggestedSeverity',
        'humanOverridden',
        'duplicateMatch',
      ],
    },
    {
      id: 'sakshi-agent-03-evidence-packet',
      name: 'Evidence Packet Agent',
      modulePath: 'src/lib/agents/evidence-packet.ts',
      businessRequirement:
        'Assemble a self-contained, cryptographically verifiable evidence dossier for citizen compensation claims under the 2019 Karnataka High Court ruling.',
      sopSteps: [
        '1. Retrieve primary hazard record, resolved BBMP ward officer contact, and all citizen corroboration records from PostgreSQL.',
        '2. Compute exact days unresolved from real stored timestamps.',
        '3. Compile chronological SHA-256 chain of custody, attach the 2019 High Court statutory duty citation (WP 42927/2015), and stamp with the explicit non-automatic-filing notice.',
      ],
      inputs: ['hazardId'],
      outputs: ['packetId', 'daysUnresolved', 'evidenceChain', 'legalBasis', 'packetIntegrityHash'],
    },
  ],
};
