//! Connection-bound lifecycle only. No credentials, keystrokes or account lists.
#[derive(Default)]
pub struct CredentialControl { pub owner:Option<u64>, pub phase:&'static str, pub token:String }
#[cfg(test)]mod tests{use super::*;
 #[test]fn bound_to_one_connection(){let mut s=CredentialControl::default();s.begin(1,"a").unwrap();assert!(s.begin(2,"b").is_err());assert!(s.status(2).is_err());assert!(s.blocks_voice());s.ready("a").unwrap();assert_eq!(s.status(1).unwrap(),"active");s.finish("a").unwrap();assert_eq!(s.status(1).unwrap(),"returned");assert!(s.blocks_voice());s.clear();assert!(!s.blocks_voice());}
 #[test]fn stale_ready_is_rejected(){let mut s=CredentialControl::default();assert!(s.ready("a").is_err());s.begin(1,"b").unwrap();assert!(s.ready("a").is_err());s.finish("b").unwrap();assert!(s.ready("b").is_err());}
}
impl CredentialControl {
 pub fn begin(&mut self,owner:u64,token:&str)->Result<(),String>{
  if self.owner.is_some(){return Err("A password popup session already exists".into());}
  self.owner=Some(owner);self.token=token.into();self.phase="starting";Ok(())
 }
 pub fn ready(&mut self,token:&str)->Result<(),String>{if self.phase!="starting"||self.token!=token{return Err("Password popup session changed".into());}self.phase="active";Ok(())}
 pub fn finish(&mut self,token:&str)->Result<(),String>{if self.owner.is_none()||self.token!=token{return Err("Password popup session changed".into());}self.phase="returned";Ok(())}
 pub fn status(&self,owner:u64)->Result<&'static str,String>{if self.owner!=Some(owner){return Err("Password popup session is not owned by this connection".into());}Ok(self.phase)}
 pub fn clear(&mut self){self.owner=None;self.phase="";self.token.clear();}
 pub fn blocks_voice(&self)->bool{self.owner.is_some()}
}
