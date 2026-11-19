// Native functions.exec source: load with new Function('tools','text', source + '; return runConnector;').
// This is an execution adapter, not a Node service. Delivery remains in analysis-handoff.yml.
async function runConnector(command, {root, queue, prNumber} = {}){
 if(!root?.startsWith('/') || !queue?.startsWith('/')) throw Error('Absolute workspace and private queue are required');
 if(!root.endsWith('/')) root += '/';

 const q=s=>"'"+s.replace(/'/g,"'\\''")+"'";
 const start=await tools.exec_command({cmd:"PATH="+q(root+"connector-bin")+":$PATH FELLESTALL_CONNECTOR_QUEUE="+q(queue)+" GITHUB_REPOSITORY=Lippen1995/Project_statsbudsjett "+command,workdir:root+"fellestall",yield_time_ms:1000,max_output_tokens:1500});
 if(!start.session_id){text(start);return;}
 for(let n=0;n<150;n++){
  const qr=await tools.exec_command({cmd:"python -c 'import pathlib,json; print(json.dumps([{\"file\":p.name,\"request\":json.loads(p.read_text())} for p in pathlib.Path(\""+queue+"\").glob(\"*.request.json\") if not p.with_name(p.name.replace(\".request.\",\".response.\")).exists()]))' ",max_output_tokens:20000});
  for(const item of JSON.parse(qr.output)){
   const {path,method,body}=item.request;
   if(!path.startsWith("repos/Lippen1995/Project_statsbudsjett/")) throw Error("Unexpected repository");
   let value,error;
   try{
    let r;
    if(method==='GET'&&path.includes('/contents/')) { const filePath=path.split('/contents/')[1].split('?')[0];r=await tools.mcp__codex_apps__github_fetch_file({repository_full_name:'Lippen1995/Project_statsbudsjett',path:filePath,ref:decodeURIComponent(path.split('?ref=')[1]||'main'),encoding:'base64'}); if(r.isError)throw Error(JSON.stringify(r)); const d=r.structuredContent; value={type:'file',encoding:'base64',sha:d.sha,content:d.content}; }
    else if(method==='GET'&&path.includes('/collaborators/')){r=await tools.mcp__codex_apps__github_get_repo_collaborator_permission({repository_full_name:'Lippen1995/Project_statsbudsjett',username:path.split('/collaborators/')[1].split('/')[0]});value=r.structuredContent;}
    else if(method==='GET') {r=await tools.mcp__codex_apps__github_fetch({url:'https://api.github.com/'+path});if(r.isError)throw Error(JSON.stringify(r));value=JSON.parse(r.structuredContent.content);}
    else if(method==='POST'&&Number.isSafeInteger(prNumber)&&path.endsWith('/issues/'+prNumber+'/comments')&&/^<!-- fellestall-feedback-status:/.test(body.body)) {r=await tools.mcp__codex_apps__github_add_comment_to_issue({repo_full_name:'Lippen1995/Project_statsbudsjett',pr_number:prNumber,comment:body.body});value=r.structuredContent;}
    else if(method==='POST'&&path.endsWith('/git/blobs')){r=await tools.mcp__codex_apps__github_create_blob({repository_full_name:'Lippen1995/Project_statsbudsjett',...body});value=r.structuredContent;}
    else if(method==='POST'&&path.endsWith('/git/trees')){if(body.tree.some(x=>x.path!=='editorial/sven-status.json'))throw Error('Only job status may be written through this adapter');r=await tools.mcp__codex_apps__github_create_tree({repository_full_name:'Lippen1995/Project_statsbudsjett',base_tree_sha:body.base_tree,tree_elements:body.tree});value=r.structuredContent;}
    else if(method==='POST'&&path.endsWith('/git/commits')){r=await tools.mcp__codex_apps__github_create_commit({repository_full_name:'Lippen1995/Project_statsbudsjett',message:body.message,parent_sha:body.parents[0],tree_sha:body.tree});value=r.structuredContent;}
    else if(method==='PATCH'&&path.endsWith('/git/refs/heads/main')){r=await tools.mcp__codex_apps__github_update_ref({repository_full_name:'Lippen1995/Project_statsbudsjett',branch_name:'main',sha:body.sha,force:false});value=r.structuredContent;}
    else throw Error('Unsupported bridge mutation: '+method+' '+path);
    if(r?.isError)throw Error(JSON.stringify(r));
    if(!value)throw Error('Missing structured response '+JSON.stringify(r));
   }catch(e){error=e.message;}
   text({method,path,result:error||'ok',...(method!=='GET'?{value}:{} )});
   await tools.exec_command({cmd:"python -c "+q("import sys,pathlib;pathlib.Path(sys.argv[1]).write_text(sys.argv[2])")+" "+q(queue+"/"+item.file.replace('.request.','.response.'))+" "+q(JSON.stringify({value,error})),max_output_tokens:100});
  }
  const out=await tools.write_stdin({session_id:start.session_id,chars:'',yield_time_ms:1000,max_output_tokens:1500});
  if(out.output)text(out.output);
  if(out.exit_code!==undefined){text({exit_code:out.exit_code});return;}
 }
}