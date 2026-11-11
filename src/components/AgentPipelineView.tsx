import React from 'react';
import { SAKSHI_ORCHESTRATE_SPEC } from '../lib/agents/orchestrate-spec.ts';

export const AgentPipelineView: React.FC = () => {
  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-xl font-bold text-slate-900 font-display">
          Sequential Three-Agent Architecture &amp; watsonx Orchestrate ADK Contract
        </h2>
        <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
          Sakshi implements three decoupled, independently unit-tested TypeScript agent modules under{' '}
          <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">src/lib/agents/</code>{' '}
          with identical Business Requirement → Standard Operating Procedure (SOP) → Input/Output seams for IBM watsonx Orchestrate ADK deployment.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {SAKSHI_ORCHESTRATE_SPEC.agents.map((agent, idx) => (
          <div
            key={agent.id}
            className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5"
          >
            <div className="space-y-3">
              <div className="text-xs font-mono text-slate-500">
                0{idx + 1}. {agent.modulePath}
              </div>
              <h3 className="text-lg font-bold text-slate-900 font-display">
                {agent.name}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {agent.businessRequirement}
              </p>

              <div className="pt-2 space-y-2">
                <div className="text-xs font-semibold text-slate-900">
                  Standard Operating Procedure (SOP):
                </div>
                <ul className="space-y-1.5 text-xs text-slate-600">
                  {agent.sopSteps.map((step) => (
                    <li key={step} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 text-xs font-mono space-y-1 text-slate-600">
              <div>Inputs: {agent.inputs.join(', ')}</div>
              <div>Outputs: {agent.outputs.join(', ')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
