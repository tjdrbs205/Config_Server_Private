import { randomUUID } from "crypto";

export interface LoggerOptions {
  prefix?: string;
  logParams?: boolean;
  logResult?: boolean;
  logDuration?: boolean;
}

const defaultOptions: LoggerOptions = {
  prefix: "LOG",
  logParams: true,
  logResult: false,
  logDuration: true,
};

/**
 * method decorator
 * @param options LoggerOptions
 */
export function Log(options: LoggerOptions = {}): MethodDecorator {
  const { prefix = "LOG", logParams = true, logResult = false, logDuration = true } = options;

  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const className = target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      const requestId = randomUUID().slice(0, 8);
      const methodName = `${className}.${String(propertyKey)}()`;
      const timestamp = () => new Date().toISOString();
      const startTime = Date.now();
      const tag = `[${prefix}] [${requestId}]`;

      // method start logging
      console.log(`${tag} [${timestamp()}] ${methodName} - START`);

      if (logParams && args.length > 0) {
        console.log(`[${tag}] Params:`, JSON.stringify(args, null, 2));
      }

      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        if (logResult) {
          console.log(`[${tag}] Result:`, JSON.stringify(result));
        }

        if (logDuration) {
          console.log(`[${tag}] [${timestamp()}] ${methodName} - END (${duration}ms)`);
        } else {
          console.log(`[${tag}] [${timestamp()}] ${methodName} - END`);
        }

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${tag}] [${timestamp()}] ${methodName} - ERROR (${duration}ms)`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

export function SimpleLog(): MethodDecorator {
  return Log({ logParams: false, logResult: false, logDuration: true });
}

export function DetailedLog(): MethodDecorator {
  return Log({ logParams: true, logResult: true, logDuration: true });
}

export function LogClass(options: LoggerOptions = {}): ClassDecorator {
  return (target: Function) => {
    const prototype = target.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    propertyNames.forEach((propertyName) => {
      if (propertyName === "constructor") return;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
      if (descriptor && typeof descriptor.value === "function") {
        const logDecorator = Log(options);
        const newDescriptor = logDecorator(prototype, propertyName, descriptor) as PropertyDescriptor;
        Object.defineProperty(prototype, propertyName, newDescriptor);
      }
    });
  };
}
