export interface SemanticJsonSchemaBase {
  description?: string;
  title?: string;
}

export type SemanticJsonSchema =
  | (SemanticJsonSchemaBase & {
    enum?: string[];
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    type: 'string';
  })
  | (SemanticJsonSchemaBase & {
    enum?: number[];
    maximum?: number;
    minimum?: number;
    type: 'number';
  })
  | (SemanticJsonSchemaBase & {
    enum?: number[];
    maximum?: number;
    minimum?: number;
    type: 'integer';
  })
  | (SemanticJsonSchemaBase & {
    enum?: boolean[];
    type: 'boolean';
  })
  | (SemanticJsonSchemaBase & {
    items: SemanticJsonSchema;
    maxItems?: number;
    minItems?: number;
    type: 'array';
  })
  | (SemanticJsonSchemaBase & {
    additionalProperties: false;
    properties: Record<string, SemanticJsonSchema>;
    required?: string[];
    type: 'object';
  });

/**
 * An immutable, portable contract snapshot attached to a pipeline boundary.
 * The schema is embedded so a published pipeline never depends on a mutable URL.
 */
export interface SemanticContractSnapshot {
  contractKey: string;
  contractRef: string;
  contractVersion: string;
  schema: SemanticJsonSchema;
  schemaChecksum: string;
}
