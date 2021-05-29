import Field from "./field.model";
import Organization from "./organization.model";
import Subfield from "./subfield.model";

export default interface User {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  organization?: Organization;
  isMentor?: boolean;  
  field?: Field;
  subfields?: Array<Subfield>;
}