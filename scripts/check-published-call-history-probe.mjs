#!/usr/bin/env node
// Fails closed if the production composition stops probing the durable
// PublishedCall archive before it delegates to the build use case.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const { parse } = createRequire(import.meta.url)('@babel/parser');

export function historyProbeFinding(source) {
  const file = parse(source, { sourceType: 'module', plugins: ['typescript', 'topLevelAwait'] });
  const functionBody = findProductionBuildBody(file.program);
  if (functionBody === null) return 'missing runProductionBuild composition function';
  const probe = awaitedProbe(functionBody);
  const use = runBuildUse(functionBody);
  if (probe === null) return 'missing awaited probePublishedCallHistory(scope) on the composed store';
  if (use === null) return 'missing production runBuildOnce({ store }) call';
  if (probe.position > use.position) return 'probePublishedCallHistory(scope) must dominate runBuildOnce({ store })';
  if (!hasProbeRefusalCheck(functionBody, probe.name, probe.position, use.position)) return 'missing failed-probe refusal before runBuildOnce({ store })';
  return null;
}

function findProductionBuildBody(file) {
  let body = null;
  const visit = (node) => {
    if (node.type === 'FunctionDeclaration' && node.id?.name === 'runProductionBuild') body = node.body;
    visitChildren(node, visit);
  };
  visit(file);
  return body;
}

function awaitedProbe(body) {
  let result = null;
  const visit = (node) => {
    if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || node.init == null) return visitChildren(node, visit);
    const initializer = node.init;
    if (initializer.type !== 'AwaitExpression' || initializer.argument.type !== 'CallExpression') return visitChildren(node, visit);
    const call = initializer.argument;
    if (call.callee.type !== 'MemberExpression' || call.callee.computed || call.callee.property.type !== 'Identifier' || call.callee.property.name !== 'probePublishedCallHistory') return visitChildren(node, visit);
    if (call.callee.object.type !== 'Identifier' || call.callee.object.name !== 'store' || call.arguments.length !== 1 || call.arguments[0]?.type !== 'Identifier' || call.arguments[0].name !== 'scope') return visitChildren(node, visit);
    result = { name: node.id.name, position: node.start };
  };
  visitChildren(body, visit);
  return result;
}

function runBuildUse(body) {
  let result = null;
  const visit = (node) => {
    if (node.type !== 'AwaitExpression' || node.argument.type !== 'CallExpression' || node.argument.callee.type !== 'Identifier' || node.argument.callee.name !== 'runBuildOnce') return visitChildren(node, visit);
    const argument = node.argument.arguments[0];
    if (argument?.type !== 'ObjectExpression' || !argument.properties.some((property) => property.type === 'ObjectProperty' && property.shorthand && property.key.type === 'Identifier' && property.key.name === 'store')) return visitChildren(node, visit);
    result = { position: node.start };
  };
  visitChildren(body, visit);
  return result;
}

function hasProbeRefusalCheck(body, name, after, before) {
  let found = false;
  const visit = (node) => {
    if (node.type !== 'IfStatement') return visitChildren(node, visit);
    const position = node.start;
    const expression = node.test;
    if (position > after && position < before && expression.type === 'UnaryExpression' && expression.operator === '!' && expression.argument.type === 'MemberExpression' && !expression.argument.computed && expression.argument.object.type === 'Identifier' && expression.argument.object.name === name && expression.argument.property.type === 'Identifier' && expression.argument.property.name === 'ok') found = true;
    visitChildren(node, visit);
  };
  visitChildren(body, visit);
  return found;
}

function visitChildren(node, visit) {
  if (node === null || typeof node !== 'object') return;
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => visitChildrenOrNode(child, visit));
    else visitChildrenOrNode(value, visit);
  }
}

function visitChildrenOrNode(value, visit) {
  if (value !== null && typeof value === 'object' && 'type' in value) visit(value);
}

const invokedAsCli = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsCli) {
  const target = resolve(process.argv[2] ?? 'src/pipeline/run-build-cli.ts');
  const finding = historyProbeFinding(readFileSync(target, 'utf8'));
  if (finding !== null) {
    console.error(`published-call history probe check failed: ${finding}`);
    process.exitCode = 1;
  }
}
