// One immutable grid, projected in the vertex shader. The same camera also renders the fallback frames.
const vertex = `
precision highp float;
attribute vec2 uv;
uniform vec4 scene; // chapter position, clock, aspect ratio, pixel ratio
uniform vec2 pointer;
uniform mediump float surface;
varying mediump vec3 tint;
varying mediump float power;
float hash(vec2 v){return fract(sin(dot(v,vec2(41.73,18.27)))*13758.41);}
float wave(vec2 p,float time){
    return .65*sin(p.x*.47+p.y*.31+time*.18)
        +.35*sin(p.x*.83-p.y*.43+sin(p.y*.3+time*.12))
        +.23*cos(p.y*.81+p.x*.29-time*.11);
}
void main(){
    float progress=scene.x, time=scene.y;
    float seed=hash(uv);
    float travel=progress*15.+time*.18;
    float z=1.05+(surface>.5 ? uv.y*34. : mod(uv.y*34.-travel,34.));
    float x=(uv.x-.5)*39.;
    vec2 location=vec2(x,z+travel);
    float w=wave(location,time);
    float valley=smoothstep(1.,9.,abs(x));
    float y=-1.9+w*(.5+valley*.86)+valley*.85;
    bool exhibit=surface<.5 && seed>.65;
    vec3 point=vec3(x,y,z);
    float first=smoothstep(.22,.88,progress);
    float second=smoothstep(1.17,1.88,progress);
    float third=smoothstep(2.18,2.9,progress);
    float a=uv.x*6.2831853;
    float ring=floor(uv.y*18.)/17.;
    // The interface is a stack of glass panes traced along their perimeters.
    float edge=uv.x*4., side=floor(edge), t=fract(edge);
    vec2 border=side<1.?vec2(t*2.-1.,1.):side<2.?vec2(1.,1.-2.*t):side<3.?vec2(1.-2.*t,-1.):vec2(-1.,2.*t-1.);
    float stack=floor(uv.y*5.)/4.-.5;
    vec3 panes=vec3(border.x*2.3+stack*.85,border.y*1.25+stack*.68,6.6+stack*2.+border.x*.8);
    // Multiple input lanes braid into one output stream.
    float lane=floor(uv.y*12.)/11.-.5;
    vec3 flow=vec3((uv.x-.5)*7.,.76*sin(a*1.4+lane*2.5+time*.35)+lane*(1.7-uv.x),6.4+.88*cos(a*1.4+lane*2.5+time*.35));
    // Two families of great circles meet in the final conversation.
    float lat=(ring-.5)*3.14159, spin=time*.13+progress*.55;
    vec3 globe=vec3(1.63*cos(lat)*cos(a+spin),1.63*sin(lat),1.63*cos(lat)*sin(a+spin));
    if(seed>.84)globe=globe.yzx;
    globe.z+=6.2;
    if(exhibit)point=mix(point,mix(mix(panes,flow,second),globe,third),first);
    else if(surface<.5 && seed<.14)point.y+=seed*42.;
    point.x+=.27*sin(travel*.16)+pointer.x*.22;
    point.y+=pointer.y*.11;
    float lens=1.8;
    float exhibitAspect=min(1.,scene.z*1.25);
    point.x*=mix(1.,exhibitAspect,exhibit?first:0.);
    gl_Position=vec4(point.x*lens/scene.z,point.y*lens+.12*point.z,0.,point.z);
    gl_PointSize=scene.w*clamp((4.5+seed*13.)/point.z,.82,5.2);
    float ridge=smoothstep(-1.1,1.,w);
    float mist=exp(-point.z*.065);
    vec3 lime=vec3(.71,.90,.23), jade=vec3(.21,.92,.66), blue=vec3(.34,.71,.98);
    tint=mix(mix(lime,jade,second),blue,third);
    if(surface>.5){
      power=(.013+.36*ridge*ridge)*mist*smoothstep(1.,2.,z)*(1.-smoothstep(32.,35.,z));
      tint=mix(tint,vec3(.34,.51,.20),.28);
    }else{
      power=(.32+.94*seed)*mist*(.59+.69*ridge);
      if(exhibit){power=mix(power,.42+.56*seed,first);tint=mix(tint,vec3(.92,.94,.79),first*.28);}
    }
}`;
const fragment = `
precision mediump float;
uniform mediump float surface;
varying mediump vec3 tint; varying mediump float power;
void main(){
    float strength=power;
    if(surface<.5){vec2 p=gl_PointCoord*2.-1.;strength*=1.-smoothstep(.04,1.,dot(p,p));}
    gl_FragColor=vec4(tint*strength,1.);
}`;

export function createField(canvas, compact=false) {
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,powerPreference:'low-power'});
    if(!gl) return null;
    const program=gl.createProgram();
    for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
        const shader=gl.createShader(type);
        gl.shaderSource(shader,source); gl.compileShader(shader);
        if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
        gl.attachShader(program,shader); gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const cols=compact?148:244, rows=compact?100:145;
    const grid=new Float32Array(cols*rows*2);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
        const i=(y*cols+x)*2;
        grid[i]=x/cols;grid[i+1]=y/rows;
    }
    // The terrain samples a continuous height field as the camera advances.
    const indices=[];
    for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){
        const i=y*cols+x;indices.push(i,i+cols,i+1,i+1,i+cols,i+cols+1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,grid,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    const coord=gl.getAttribLocation(program,'uv');
    gl.enableVertexAttribArray(coord);gl.vertexAttribPointer(coord,2,gl.FLOAT,false,0,0);
    const scene=gl.getUniformLocation(program,'scene'),pointer=gl.getUniformLocation(program,'pointer'),surface=gl.getUniformLocation(program,'surface');
    return (progress,time,x=0,y=0,dpr=1)=>{
        gl.viewport(0,0,canvas.width,canvas.height);
        gl.clearColor(.022,.030,.038,1);gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform4f(scene,progress,time,canvas.width/canvas.height,dpr);gl.uniform2f(pointer,x,y);
        gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.uniform1f(surface,1);
        gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
        gl.uniform1f(surface,0);gl.drawArrays(gl.POINTS,0,cols*rows);
    };
}
