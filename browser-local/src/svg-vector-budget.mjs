/** R66 DEV26: bounded per-page SVG vector complexity before synchronous SVGtoPDF.
 * The checker never changes geometry, text, fonts, or embedded images.
 * It is a fail-closed preflight guard, NOT a way to interrupt a synchronous WASM
 * or SVGtoPDF call that has already begun. No new network or DOM dependencies.
 */
export const SVG_VECTOR_BUDGET = Object.freeze({
  pathSingle: 2_000_000,
  pathTotal: 12_000_000,
  commandsSingle: 150_000,
  commandsTotal: 300_000,
  pointsSingle: 2_000_000,
  pointsTotal: 8_000_000,
  textSingle: 500_000,
  textTotal: 2_000_000,
});

function isCommand(charCode) {
  // SVG path commands, ASCII only. Does not count exponent 'e' as command.
  return charCode===65||charCode===67||charCode===72||charCode===76||
    charCode===77||charCode===81||charCode===83||charCode===84||
    charCode===86||charCode===90||charCode===97||charCode===99||
    charCode===104||charCode===108||charCode===109||charCode===113||
    charCode===115||charCode===116||charCode===118||charCode===122;
}

export function createSvgVectorBudget(limits=SVG_VECTOR_BUDGET){
  let pathChars=0,commands=0,pointsChars=0,textChars=0;
  // Avoid regex match arrays and do not cache or copy potentially huge path strings.
  function element(el){
    const tag=el?.localName;
    if(tag==='path'){
      const d=el.getAttribute('d')||'';
      if(d.length>limits.pathSingle || (pathChars+=d.length)>limits.pathTotal)
        return 'SVG_VECTOR_PATH_BUDGET';
      let count=0;
      for(let i=0;i<d.length;i++){
        if(isCommand(d.charCodeAt(i)) && ++count>limits.commandsSingle)
          return 'SVG_VECTOR_COMMAND_BUDGET';
      }
      commands+=count;
      if(commands>limits.commandsTotal)return 'SVG_VECTOR_COMMAND_BUDGET';
    }else if(tag==='polyline'||tag==='polygon'){
      const data=el.getAttribute('points')||'';
      if(data.length>limits.pointsSingle || (pointsChars+=data.length)>limits.pointsTotal)
        return 'SVG_VECTOR_POINTS_BUDGET';
    }
    return null;
  }
  function text(value){
    const length=String(value).length;
    if(length>limits.textSingle || (textChars+=length)>limits.textTotal)
      return 'SVG_VECTOR_TEXT_BUDGET';
    return null;
  }
  return {element,text,get totals(){return {pathChars,commands,pointsChars,textChars};}};
}
