export function HandleErrorContext(handler?: (error: unknown) => void): MethodDecorator {
  return (target, propertyKey, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error: any) {
        if (handler) handler(error);
        else {
          console.log(`[${this.constructor.name}] ${String(propertyKey)}() failed`);
          console.error(`Context info: `, this);
          console.error(`Error: `, error.message ?? error);
        }
        throw error;
      }
    };
    return descriptor;
  };
}
