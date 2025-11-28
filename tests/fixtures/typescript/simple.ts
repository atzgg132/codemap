import path from 'path';
import { helper } from './helper';

export const value = 42;

export default function greet(name: string) {
  return `Hello ${name} ${path.basename(helper)}`;
}
