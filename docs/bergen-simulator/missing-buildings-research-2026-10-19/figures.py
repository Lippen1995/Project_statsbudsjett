#!/usr/bin/env python3
"""Reproducible research figures. No third-party basemap or inferred architecture."""
import json

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import PatchCollection
from matplotlib.patches import Polygon as Patch, Patch as LegendPatch, PathPatch
from matplotlib.path import Path as PlotPath
import numpy as np
import rasterio
from rasterio.plot import show
from shapely.geometry import box, shape
from shapely.ops import transform
from shapely.geometry.polygon import orient

from audit import read, APP, HERE, TO_UTM, load_baseline


def patches(geoms,ax,**kwargs):
    pp=[]
    for g in geoms:
        for part in ([g] if g.geom_type=='Polygon' else getattr(g,'geoms',[])):
            if part.geom_type=='Polygon':
                part=orient(part,sign=1)
                rings=[part.exterior,*part.interiors]
                paths=[]
                for ring in rings:
                    points=np.array(ring.coords)
                    codes=[PlotPath.MOVETO]+[PlotPath.LINETO]*(len(points)-2)+[PlotPath.CLOSEPOLY]
                    paths.append(PlotPath(points,codes))
                pp.append(PathPatch(PlotPath.make_compound_path(*paths)))
    ax.add_collection(PatchCollection(pp,**kwargs))


def format_map(ax,title):
    ax.set_aspect('equal')
    ax.set_title(title,loc='left',fontsize=15,pad=15)
    ax.set_xlabel('Øst, EUREF89 / UTM32 (m)')
    ax.set_ylabel('Nord (m)')
    ax.ticklabel_format(style='plain',useOffset=False)
    ax.grid(alpha=.12)


def main():
    plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'figure.facecolor':'#faf9f4','axes.facecolor':'#e6e8e6'})
    d,base=load_baseline()
    fs=read('candidates.geojson.gz')['features']
    hr=json.loads((HERE/'height-results.json').read_text())
    height={r['id']:r for r in hr['records']}
    fig,ax=plt.subplots(figsize=(11,12))
    patches([g for b,g in base],ax,facecolor='#686e72',edgecolor='none',alpha=.7)
    for dataset,color in [('microsoft','#cb7a13'),('overture','#8c448d')]:
        patches([transform(TO_UTM.transform,shape(f['geometry']))for f in fs if f['properties']['dataset']==dataset],ax,
                facecolor='none',edgecolor=color,linewidth=.9)
    for b,g in base:
        if b['name']in ('Skur 11','Håkonshallen','Mariakirken','Den Nationale Scene'):
            ax.annotate(b['name'],g.centroid.coords[0],xytext=(5,5),textcoords='offset points',fontsize=8)
    projected=transform(TO_UTM.transform,box(*d['bounds']))
    ax.set_xlim(projected.bounds[0],projected.bounds[2]);ax.set_ylim(projected.bounds[1],projected.bounds[3])
    format_map(ax,'Sentrum: eksisterende fotavtrykk og mulige dekningshull')
    ax.legend(handles=[LegendPatch(color='#686e72',label='6 502 eksisterende fotavtrykk (6 501 kilde-ID-er)'),
                       LegendPatch(facecolor='none',edgecolor='#cb7a13',label='541 Microsoft-kandidater'),
                       LegendPatch(facecolor='none',edgecolor='#8c448d',label='179 Overture-kandidater (ikke uavhengige)')],loc='upper left',fontsize=9)
    fig.text(.08,.025,'Kun analyse. Ingen kandidater godkjent/importert. Uten bakgrunnskart. © OSM-bidragsytere / Overture / Microsoft.',fontsize=8)
    fig.tight_layout(rect=(0,.045,1,1));fig.savefig(HERE/'01-coverage.png',dpi=150);plt.close(fig)

    dom=rasterio.open(APP/'tests/fixtures/r1b-dom.tif')
    extent=box(*dom.bounds)
    fig,ax=plt.subplots(figsize=(11,12))
    show(dom,ax=ax,cmap='Greys',vmin=0,vmax=30,alpha=.55)
    for b,g in base:
        if extent.intersects(g):
            patches([g],ax,facecolor='none',edgecolor='#1287a5' if b['heightStatus']=='unknown' else '#484f54',linewidth=.7)
    for f in fs:
        g=transform(TO_UTM.transform,shape(f['geometry']))
        if not extent.covers(g):continue
        r=height[f['id']]
        color='#e05242' if r['status']=='no-bounded-raised-surface' else '#bc801b'
        patches([g],ax,facecolor='none',edgecolor=color,linewidth=1.5)
        if 'line-105626:'in f['id'] or 'line-23673:'in f['id']:
            ax.annotate('MS '+('105626: Q90 = 0,16 m'if '105626'in f['id'] else '23673: veikorridorkonflikt'),
                        g.centroid.coords[0],xytext=(12,12),textcoords='offset points',fontsize=8,
                        arrowprops={'arrowstyle':'-','linewidth':.5})
    skur=next(g for b,g in base if b['id']=='way/393025479')
    ax.annotate('Skur 11',skur.centroid.coords[0],xytext=(8,-20),textcoords='offset points',fontsize=10)
    ax.set_xlim(dom.bounds.left,dom.bounds.right);ax.set_ylim(dom.bounds.bottom,dom.bounds.top)
    format_map(ax,'Bryggen: kontroll mot eksisterende DOM, 0,5 m / 2022')
    ax.legend(handles=[LegendPatch(facecolor='none',edgecolor='#1287a5',label='Eksisterende bygg uten metrisk høyde'),
                       LegendPatch(facecolor='none',edgecolor='#e05242',label='Kandidat uten hevet overflate i dette rasteret'),
                       LegendPatch(facecolor='none',edgecolor='#bc801b',label='Annen uavklart kandidat')],loc='upper left',fontsize=8)
    fig.text(.08,.025,'DOM: © Kartverket / Bergen kommune / Terratec–Field, CC BY 4.0. Fotavtrykk: ODbL. Ingen nye bygg verifisert.',fontsize=8)
    fig.tight_layout(rect=(0,.045,1,1));fig.savefig(HERE/'02-bryggen-screen.png',dpi=150);plt.close(fig)

    ring=np.array(skur.minimum_rotated_rectangle.exterior.coords)[:-1]
    edges=np.roll(ring,-1,axis=0)-ring
    along=edges[np.argmax(np.linalg.norm(edges,axis=1))];along/=np.linalg.norm(along)
    across=np.array([-along[1],along[0]])
    yy,xx=np.indices(dom.shape)
    xs,ys=rasterio.transform.xy(dom.transform,yy.ravel(),xx.ravel())
    from shapely import contains_xy
    keep=contains_xy(skur.buffer(-.75),np.array(xs),np.array(ys))
    xy=np.column_stack([np.array(xs)[keep],np.array(ys)[keep]])-np.array([skur.centroid.x,skur.centroid.y])
    vals=dom.read(1).ravel()[keep]
    r=height['way/393025479']['roof'];b=r['coefficients']
    v=xy@across
    fig,ax=plt.subplots(figsize=(10,5))
    ax.scatter(v,vals,s=6,alpha=.4,label='DOM-celler, 0,5 m (ikke rå laserpunkter)',color='#657b83')
    line=np.linspace(v.min(),v.max(),300)
    ax.plot(line,b[0]+b[2]*abs(line),color='#a3462e',label='Tilpasset symmetrisk saltak-hypotese',linewidth=2)
    ax.set(xlabel='Avstand på tvers av antatt møneakse (m)',ylabel='Overflatehøyde NN2000 (m)',title='Skur 11: rasteret støtter takvolum, ikke fasadedetaljer')
    ax.legend();ax.grid(alpha=.2)
    fig.text(.1,.012,'17,53° estimert helning; 0,044 m holdout-RMSE er intern tilpasning, ikke uavhengig oppmålingsnøyaktighet.',fontsize=8)
    fig.tight_layout(rect=(0,.04,1,1));fig.savefig(HERE/'03-skur-roof-profile.png',dpi=150);plt.close(fig)


if __name__=='__main__':main()
