import type { ArgumentNode, DirectiveNode, VariableDefinitionNode } from 'graphql/language';
import { Kind } from 'graphql/language';

export type DirectiveArg = {
  name: string;
  variable: {
    name: string;
    type: 'String' | 'ID';
  };
};

type DirectiveDefinition = {
  name: string;
  args: DirectiveArg[];
};

type DirectiveOutput = {
  variableDefinitions: VariableDefinitionNode[];
  directive: DirectiveNode;
};

export function createOperationDirective(def: DirectiveDefinition): DirectiveOutput {
  const variableDefinitions: VariableDefinitionNode[] = [];
  const directiveArgs: ArgumentNode[] = def.args.map((arg) => {
    const varDef: VariableDefinitionNode = {
      kind: Kind.VARIABLE_DEFINITION,
      type: {
        kind: Kind.NON_NULL_TYPE,
        type: {
          kind: Kind.NAMED_TYPE,
          name: {
            kind: Kind.NAME,
            value: arg.variable.type,
          },
        },
      },
      variable: {
        kind: Kind.VARIABLE,
        name: {
          kind: Kind.NAME,
          value: arg.variable.name,
        },
      },
    };
    variableDefinitions.push(varDef);
    return {
      kind: Kind.ARGUMENT,
      name: { kind: Kind.NAME, value: arg.name },
      value: {
        kind: Kind.VARIABLE,
        name: {
          kind: Kind.NAME,
          value: arg.variable.name,
        },
      },
    };
  });
  const directive: DirectiveNode = {
    kind: Kind.DIRECTIVE,
    name: {
      kind: Kind.NAME,
      value: def.name,
    },
    arguments: directiveArgs,
  };
  return {
    variableDefinitions,
    directive,
  };
}
