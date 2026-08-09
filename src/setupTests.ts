import '@happy-dom/global-registrator/register.js';
import { expect } from 'bun:test';
import * as matchers from '@testing-library/jest-dom/matchers';

expect.extend(matchers);
