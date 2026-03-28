declare module "bcryptjs" {
  export function hash(value: string, saltOrRounds: number | string): Promise<string>;
  export function compare(value: string, encrypted: string): Promise<boolean>;

  const bcrypt: {
    hash: typeof hash;
    compare: typeof compare;
  };

  export default bcrypt;
}
