'use client';

import KeyValueEditor from './KeyValueEditor';
import type { KeyValuePair } from '../types';

interface ParamsTabProps {
  params: KeyValuePair[];
  onChange: (params: KeyValuePair[]) => void;
}

export default function ParamsTab({ params, onChange }: ParamsTabProps) {
  return (
    <div className="p-4">
      <div className="text-sm text-muted-foreground mb-4">
        Query parameters will be appended to the URL as ?key=value&key2=value2
      </div>
      <KeyValueEditor
        pairs={params}
        onChange={onChange}
        keyPlaceholder="Parameter"
        valuePlaceholder="Value"
        showDescription
      />
    </div>
  );
}
